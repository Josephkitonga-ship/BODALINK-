/* Passenger: request a ride or parcel, then follow the trip live. */
(function () {
  const BL = (window.BL = window.BL || {});
  const ACTIVE = ["bidding", "open", "assigned", "picked"];
  const LABEL = { bidding: "Collecting bids", open: "Finding a rider", assigned: "Rider on the way", picked: "On the way", done: "Done", cancelled: "Cancelled", expired: "No riders" };

  /* ---------- book ---------- */
  let weight = "standard", auto = false, kind = "ride";
  BL.views.book = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      BL.fillStages($("#bStage"));
      const fare = () => ($("#bFare").textContent = BL.money(BL.fareFor($("#bStage").value)));
      $("#bStage").onchange = fare; fare();
      BL.weightChips($("#bWeights"), weight);
      const tab = (k) => {
        kind = k;
        BL.$$("#bTabs [data-k]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k));
        $("#bRide").hidden = k !== "ride"; $("#bParcel").hidden = k !== "parcel";
      };
      sec._tab = tab;
      sec.addEventListener("click", (e) => {
        const t = e.target.closest("#bTabs [data-k]"); if (t) tab(t.dataset.k);
        const w = e.target.closest("[data-w]"); if (w) { weight = w.dataset.w; BL.weightChips($("#bWeights"), weight); }
        if (e.target.closest("#bAuto")) { auto = !auto; $("#bAuto").setAttribute("aria-checked", auto); }
      });
      $("#bRide").onsubmit = (e) => {
        e.preventDefault();
        const dest = $("#bDest").value.trim();
        if (!$("#bStage").value) return BL.toast("Pick your pickup stage.", "err");
        if (dest.length < 2) return BL.toast("Tell us where you are going.", "err");
        const body = { kind: "ride", pickup_stage: $("#bStage").value, dropoff: dest };
        const max = parseInt($("#bMax").value.replace(/\D/g, ""), 10);
        if (max) { body.max_price = max; body.auto_accept = auto; }
        BL.busy(e.submitter, async () => { await BL.api.create("requests", body); location.hash = "#/trip"; });
      };
      $("#bParcel").onsubmit = (e) => {
        e.preventDefault();
        if ($("#bStore").value.trim().length < 2) return BL.toast("Enter the store name.", "err");
        if ($("#bDrop").value.trim().length < 2) return BL.toast("Enter the dropoff stage.", "err");
        BL.busy(e.submitter, async () => {
          await BL.api.create("requests", { kind: "parcel", merchant: $("#bStore").value.trim(), dropoff: $("#bDrop").value.trim(), weight });
          location.hash = "#/trip";
        });
      };
    },
    async show(sec) {
      const me = BL.api.me, $ = (s) => BL.$(s, sec);
      $("#bHello").textContent = "Hi " + me.name.split(" ")[0];
      $("#bNudge").hidden = !!(me.id_verified || me.national_id);
      BL.fillStages($("#bStage"));
      $("#bFare").textContent = BL.money(BL.fareFor($("#bStage").value));
      let d = null;
      try { d = JSON.parse(localStorage.getItem("bl.draft") || "null"); } catch (_) {}
      if (d) {
        localStorage.removeItem("bl.draft");
        sec._tab(d.kind === "parcel" ? "parcel" : "ride");
        if (d.pickup_stage) { $("#bStage").value = d.pickup_stage; $("#bFare").textContent = BL.money(BL.fareFor(d.pickup_stage)); }
        if (d.dropoff) (d.kind === "parcel" ? $("#bDrop") : $("#bDest")).value = d.dropoff;
        if (d.merchant) $("#bStore").value = d.merchant;
        if (d.weight) { weight = d.weight; BL.weightChips($("#bWeights"), weight); }
      }
      try {
        const busy = await BL.api.list("requests", { filter: 'passenger = "' + me.id + '" && (status = "bidding" || status = "open" || status = "assigned" || status = "picked")', perPage: 1 });
        if (busy.length) location.hash = "#/trip";
      } catch (_) {}
    },
  };

  /* ---------- trip ---------- */
  let sec, items = [], active = null, bids = [], code = "", contact = null, ticker = null, unsubs = [], pending = null;

  const route = (r) => BL.h`<div class="route"><p>${r.pickup || "Pickup"}</p><p>${r.dropoff}</p></div>`;
  const steps = (r) => {
    const order = ["assigned", "picked", "done"];
    const at = order.indexOf(r.status);
    const names = r.kind === "ride" ? ["Rider assigned", "Ride started", "Arrived"] : ["Rider claimed it", "Parcel picked up", "Delivered"];
    return BL.h`<ol class="steps">${names.map((n, i) => BL.h`<li class="${i < at ? "done" : i === at ? "now" : ""}">${n}</li>`)}</ol>`;
  };
  const shareText = (r) => (r.kind === "ride"
    ? `BodaLink ride from ${r.pickup} to ${r.dropoff}. Rider ${r.rider_name}, ${r.rider_plate}, KSh ${r.fare}.`
    : `BodaLink parcel from ${r.merchant} to ${r.dropoff}. Rider ${r.rider_name}, ${r.rider_plate}.`);

  function viewActive(r) {
    const p = r.kind === "parcel";
    const head = BL.h`<div class="row between"><span class="badge ${p ? "badge--parcel" : "badge--ok"}">${p ? "Quickshelf parcel" : "Boda ride"}</span><span class="badge">${LABEL[r.status]}</span></div>`;
    if (r.status === "bidding") {
      const ends = BL.date(r.bidding_ends).getTime();
      const left = Math.max(0, Math.round((ends - Date.now()) / 1000));
      return BL.h`<div class="card stack">${head}${route(r)}
        <div class="row between"><div><b>${left > 0 ? "Riders are bidding" : "Picking the best bid"}</b><p class="hint">Suggested fare ${BL.money(r.suggested)}${r.auto_accept ? ". We take the first bid at or under " + BL.money(r.max_price) + "." : ""}</p></div>
          <div class="ring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/><circle cx="22" cy="22" r="18" id="ringC" style="stroke-dashoffset:${113.1 * (1 - left / BL.cfg.bid_seconds)}"/></svg><span id="ringT">${left}</span></div></div>
        ${bids.length ? bids.map((b) => BL.h`<div class="item"><div class="avatar">${BL.initials(b.rider_name)}</div>
          <div class="grow"><div class="t">${b.rider_name}</div><div class="s">${b.rider_plate}, ${BL.stars(b.rider_rating)}</div></div>
          <b class="money" style="font-size:19px">${BL.money(b.amount)}</b><button class="btn btn--green btn--sm" data-act="accept" data-id="${b.id}">Accept</button></div>`)
          : BL.h`<div class="empty"><div class="pulse"></div><p style="margin-top:22px">Asking riders at your stage. Bids appear here.</p></div>`}
        <button class="btn btn--soft btn--block" data-act="cancel">Cancel request</button></div>`;
    }
    if (r.status === "open") {
      return BL.h`<div class="card stack">${head}${route(r)}
        <div class="empty"><div class="pulse pulse--amber"></div><p style="margin-top:22px">Sent to every online rider. The first to accept takes it.</p></div>
        <div class="card card--flat center"><p class="small muted">Pickup code, give it to the rider</p><div class="money" style="font-size:38px;letter-spacing:.2em">${code}</div></div>
        <div class="row between"><span class="muted">Delivery fee</span><b class="money">${BL.money(r.fee)}</b></div>
        <button class="btn btn--soft btn--block" data-act="cancel">Cancel request</button></div>`;
    }
    // assigned or picked
    return BL.h`<div class="card stack">${head}${route(r)}
      <div class="row"><div class="avatar">${BL.initials(r.rider_name)}</div><div class="grow"><div class="t">${r.rider_name}</div><div class="s">${r.rider_plate}</div></div>
        <b class="money" style="font-size:20px">${BL.money(r.kind === "ride" ? r.fare : r.fee)}</b></div>
      ${p ? BL.h`<div class="card card--flat center"><p class="small muted">Pickup code, give it to the rider</p><div class="money" style="font-size:38px;letter-spacing:.2em">${code}</div></div>` : ""}
      ${steps(r)}
      <div class="row wrap">${contact ? BL.h`<a class="btn btn--dark grow" href="${BL.tel(contact.phone)}">Call rider</a>
        <a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink(contact.phone, "Hi " + r.rider_name.split(" ")[0] + ", I am your BodaLink " + (p ? "sender" : "passenger") + " at " + (r.pickup || "the stage") + ".")}">WhatsApp</a>` : ""}
        <a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink("", shareText(r))}">Share trip</a></div>
      ${r.status === "assigned" ? BL.h`<button class="btn btn--danger btn--block" data-act="cancel">Cancel trip</button>` : ""}
      <p class="hint">${r.kind === "ride" ? "Pay your rider in cash on arrival." : "The rider keeps 85% of the fee."}</p></div>`;
  }

  function viewFinished(r) {
    if (r.status === "done") {
      return BL.h`<div class="card stack center"><h2>${r.kind === "ride" ? "You have arrived" : "Parcel delivered"}</h2>
        <p class="muted">${r.rider_name}, ${r.rider_plate}${r.kind === "ride" ? ". Pay " + BL.money(r.fare) + " in cash." : ""}</p>
        ${r.rating ? BL.h`<p>You rated this trip ${r.rating} of 5. Thank you.</p>` : BL.h`<p class="label">How was ${r.rider_name.split(" ")[0]}?</p>
          <div class="stars" style="justify-content:center">${[1, 2, 3, 4, 5].map((n) => BL.h`<button data-act="rate" data-n="${n}" aria-label="${n} stars">★</button>`)}</div>`}
        <a class="btn btn--green btn--block" href="#/book" data-act="again">Book another</a></div>`;
    }
    return BL.h`<div class="card stack center"><h3>${r.status === "expired" ? "No riders available right now" : "Trip cancelled"}</h3>
      <p class="muted">${r.status === "expired" ? "Try again in a few minutes, or raise your price." : "Nothing was charged."}</p>
      <a class="btn btn--green btn--block" href="#/book">Book again</a></div>`;
  }

  function paint() {
    const box = BL.$("#tActive", sec);
    const latest = items[0];
    if (active) BL.html(box, viewActive(active));
    else if (latest && (latest.status === "done" ? !latest.rating : Date.now() - BL.date(latest.updated) < 30 * 60000)) BL.html(box, viewFinished(latest));
    else BL.html(box, BL.h`<div class="card empty"><h3>No trip right now</h3><p>Ready when you are.</p><a class="btn btn--green" href="#/book">Book a ride</a></div>`);
    const past = items.filter((r) => r !== active);
    BL.html(BL.$("#tHist", sec), past.length ? BL.h`${past.map((r) => BL.h`<div class="item"><span class="badge ${r.kind === "parcel" ? "badge--parcel" : ""}">${r.kind === "parcel" ? "Parcel" : "Ride"}</span>
      <div class="grow"><div class="t">${r.pickup} to ${r.dropoff}</div><div class="s">${BL.ago(r.created)}, ${LABEL[r.status]}</div></div><b class="money">${r.status === "done" ? BL.money(r.kind === "ride" ? r.fare : r.fee) : ""}</b></div>`)}`
      : BL.h`<div class="empty">Your trips will show up here.</div>`);
  }

  async function load() {
    const me = BL.api.me;
    try {
      items = await BL.api.list("requests", { filter: 'passenger = "' + me.id + '"', sort: "-created", perPage: 20 });
      active = items.find((r) => ACTIVE.indexOf(r.status) > -1) || null;
      bids = []; code = ""; contact = null;
      if (active) {
        const jobs = [];
        if (active.status === "bidding") jobs.push(BL.api.list("bids", { filter: 'request = "' + active.id + '" && status = "open"', sort: "amount" }).then((b) => (bids = b)));
        if (active.kind === "parcel") jobs.push(BL.api.list("secrets", { filter: 'request = "' + active.id + '"' }).then((s) => (code = s[0] ? s[0].code : "")));
        if (active.status === "assigned" || active.status === "picked") jobs.push(BL.api.get("/api/bl/contact?request=" + active.id).then((c) => (contact = c)).catch(() => {}));
        await Promise.all(jobs);
      }
    } catch (e) { BL.toast(e.message, "err"); }
    paint();
  }
  const soon = () => { clearTimeout(pending); pending = setTimeout(load, 250); };

  BL.views.trip = {
    mount(s) {
      sec = s;
      sec.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-act]"); if (!b) return;
        const a = b.dataset.act;
        if (a === "accept") BL.busy(b, async () => { await BL.api.post("/api/bl/accept", { bid: b.dataset.id }); BL.toast("Rider confirmed.", "ok"); await load(); });
        if (a === "cancel" && (await BL.confirm("Cancel this trip?", "Your rider will be told straight away.", "Cancel trip"))) BL.busy(b, async () => { await BL.api.post("/api/bl/cancel", { request: active.id }); await load(); });
        if (a === "rate") { await BL.api.post("/api/bl/rate", { request: items[0].id, rating: +b.dataset.n }).catch((er) => BL.toast(er.message, "err")); BL.toast("Thanks for rating.", "ok"); load(); }
      });
    },
    show() {
      load();
      const me = BL.api.me.id;
      unsubs = [BL.realtime.on("requests/*", (ev) => ev.record.passenger === me && soon()), BL.realtime.on("bids/*", soon)];
      clearInterval(ticker);
      ticker = setInterval(() => {
        if (!active || active.status !== "bidding") return;
        const left = Math.max(0, Math.round((BL.date(active.bidding_ends).getTime() - Date.now()) / 1000));
        const t = BL.$("#ringT", sec), c = BL.$("#ringC", sec);
        if (t) t.textContent = left;
        if (c) c.style.strokeDashoffset = 113.1 * (1 - left / BL.cfg.bid_seconds);
        if (left === 0 && !active._swept) { active._swept = true; BL.api.post("/api/bl/sweep").then(() => setTimeout(load, 800)).catch(() => {}); }
      }, 1000);
    },
    hide() { unsubs.forEach((u) => u()); unsubs = []; clearInterval(ticker); },
  };
})();
