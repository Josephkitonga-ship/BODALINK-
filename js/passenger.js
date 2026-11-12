/* Passenger: request a ride or parcel, then follow the trip live. */
(function () {
  const BL = (window.BL = window.BL || {});
  const ACTIVE = ["bidding", "assigned", "picked"];
  const LABEL = { bidding: "Collecting bids", assigned: "Rider on the way", picked: "On the way", done: "Done", cancelled: "Cancelled", expired: "No riders" };

  /* ---------- book ---------- */
  let size = "small", payer = "sender";
  const auto = { ride: false, parcel: false };
  const coords = { bFrom: null, bPFrom: null };
  BL.views.book = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      BL.sizeChips($("#bWeights"), size);
      const tab = (k) => {
        BL.$$("#bTabs [data-k]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k));
        $("#bRide").hidden = k !== "ride"; $("#bParcel").hidden = k !== "parcel";
      };
      sec._tab = tab;
      sec.addEventListener("click", async (e) => {
        const t = e.target.closest("#bTabs [data-k]"); if (t) tab(t.dataset.k);
        const w = e.target.closest("[data-w]"); if (w) { size = w.dataset.w; BL.sizeChips($("#bWeights"), size); }
        const p = e.target.closest("[data-payer]"); if (p) { payer = p.dataset.payer; BL.$$("[data-payer]", sec).forEach((b) => b.setAttribute("aria-pressed", b === p)); }
        const a = e.target.closest("[data-auto]"); if (a) { auto[a.dataset.auto] = !auto[a.dataset.auto]; a.setAttribute("aria-checked", auto[a.dataset.auto]); }
        const l = e.target.closest("[data-locate]");
        if (l) BL.busy(l, async () => {
          const id = l.dataset.locate, pos = await BL.locate();
          coords[id] = pos;
          const box = $("#" + id);
          if (!box.value.trim() || /^my current location/i.test(box.value)) box.value = "My current location";
          BL.toast("Location shared. Riders can open it in Google Maps.", "ok");
        });
      });
      // typing a new pickup place replaces a shared location
      ["bFrom", "bPFrom"].forEach((id) => $("#" + id).addEventListener("input", (e) => { if (!/^my current location/i.test(e.target.value)) coords[id] = null; }));
      // optional fare guide, only when admin switches estimates on
      const est = () => {
        const on = BL.fare && BL.fare.enabled();
        const r = $("#bEst"), p = $("#bPEst");
        r.hidden = !on || $("#bDest").value.trim().length < 2; p.hidden = !on || $("#bDrop").value.trim().length < 2;
        if (on) { r.textContent = BL.fare.line({ dropoff: $("#bDest").value, kind: "ride" }); p.textContent = BL.fare.line({ dropoff: $("#bDrop").value, size, kind: "parcel" }); }
      };
      sec._est = est;
      ["bDest", "bDrop"].forEach((id) => $("#" + id).addEventListener("input", est));
      sec.addEventListener("click", (e) => { if (e.target.closest("[data-w]")) est(); });
      const maxOf = (el) => parseInt(el.value.replace(/\D/g, ""), 10) || 0;
      const where = (id, c) => (c[id] ? { pickup_lat: c[id].lat, pickup_lng: c[id].lng } : {});
      $("#bRide").onsubmit = (e) => {
        e.preventDefault();
        if ($("#bFrom").value.trim().length < 2) return BL.toast("Tell us where to pick you up.", "err");
        if ($("#bDest").value.trim().length < 2) return BL.toast("Tell us where you are going.", "err");
        const body = { kind: "ride", pickup: $("#bFrom").value.trim(), dropoff: $("#bDest").value.trim(), ...where("bFrom", coords) };
        const max = maxOf($("#bMax")); if (max) { body.max_price = max; body.auto_accept = auto.ride; }
        BL.busy(e.submitter, async () => { await BL.api.create("requests", body); location.hash = "#/trip"; });
      };
      $("#bParcel").onsubmit = (e) => {
        e.preventDefault();
        const need = [["#bPFrom", "Tell us where to pick the parcel up."], ["#bDrop", "Enter where the parcel is going."], ["#bItem", "Say what you are sending."], ["#bRName", "Enter the recipient's name."]];
        for (const [id, msg] of need) if ($(id).value.trim().length < 2) return BL.toast(msg, "err");
        if (!BL.normPhone($("#bRPhone").value)) return BL.toast("Enter the recipient's phone number.", "err");
        const body = { kind: "parcel", pickup: $("#bPFrom").value.trim(), pickup_note: $("#bPNote").value.trim(), dropoff: $("#bDrop").value.trim(), item: $("#bItem").value.trim(),
          weight: size, payer, recipient_name: $("#bRName").value.trim(), recipient_phone: $("#bRPhone").value.trim(), ...where("bPFrom", coords) };
        const max = maxOf($("#bPMax")); if (max) { body.max_price = max; body.auto_accept = auto.parcel; }
        BL.busy(e.submitter, async () => { await BL.api.create("requests", body); location.hash = "#/trip"; });
      };
    },
    async show(sec) {
      const me = BL.api.me, $ = (s) => BL.$(s, sec);
      $("#bHello").textContent = "Hi " + me.name.split(" ")[0];
      $("#bNudge").hidden = !!(me.id_verified || me.national_id);
      BL.deck.mount($("#bDeck"));
      let d = null;
      try { d = JSON.parse(localStorage.getItem("bl.draft") || "null"); } catch (_) {}
      if (d) {
        localStorage.removeItem("bl.draft");
        const parcel = d.kind === "parcel";
        sec._tab(parcel ? "parcel" : "ride");
        if (d.pickup) $(parcel ? "#bPFrom" : "#bFrom").value = d.pickup;
        if (d.dropoff) $(parcel ? "#bDrop" : "#bDest").value = d.dropoff;
        if (d.weight) { size = d.weight; BL.sizeChips($("#bWeights"), size); }
        if (d.item) $("#bItem").value = d.item;
        if (d.note) $("#bPNote").value = d.note;
        if (d.rname) $("#bRName").value = d.rname;
        if (d.rphone) $("#bRPhone").value = d.rphone;
        if (d.payer) { payer = d.payer; BL.$$("[data-payer]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.payer === payer)); }
      }
      sec._est();
      BL.directory.mount($("#bDir"));
      try {
        const busy = await BL.api.list("requests", { filter: 'passenger = "' + me.id + '" && (status = "bidding" || status = "assigned" || status = "picked")', perPage: 1 });
        if (busy.length) location.hash = "#/trip";
      } catch (_) {}
    },
  };

  /* ---------- trip ---------- */
  let sec, items = [], active = null, bids = [], secret = null, contact = null, ticker = null, unsubs = [], pending = null;
  const SIZE = { small: "Small", medium: "Medium", large: "Large" };

  const route = (r) => BL.h`<div class="route"><p>${r.pickup}${r.pickup_note ? BL.h`<small class="muted" style="display:block;font-weight:500">${r.pickup_note}</small>` : ""}</p><p>${r.dropoff}</p></div>`;
  const steps = (r) => {
    const at = ["assigned", "picked", "done"].indexOf(r.status);
    const names = r.kind === "ride" ? ["Rider assigned", "Ride started", "Arrived"] : ["Rider assigned", "Parcel picked up", "Delivered"];
    return BL.h`<ol class="steps">${names.map((n, i) => BL.h`<li class="${i < at ? "done" : i === at ? "now" : ""}">${n}</li>`)}</ol>`;
  };
  const payLine = (r) => (r.kind === "ride" ? "Pay your rider in cash on arrival." : r.payer === "recipient" ? "The recipient pays the rider when the parcel arrives." : "You pay the rider when they collect the parcel.");
  const shareText = (r) => (r.kind === "ride"
    ? `BodaLink ride from ${r.pickup} to ${r.dropoff}. Rider ${r.rider_name}, ${r.rider_plate}, KSh ${r.fare}.`
    : `BodaLink parcel (${r.item}) from ${r.pickup} to ${r.dropoff}. Rider ${r.rider_name}, ${r.rider_plate}, KSh ${r.fare}.`);
  const dist = (b) => BL.kmText(BL.km(active && active.pickup_lat ? { lat: active.pickup_lat, lng: active.pickup_lng } : null, { lat: b.rider_lat, lng: b.rider_lng }));
  const ticketBtns = (r) => (contact ? BL.h`<a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink(contact.phone, BL.ticket(r, BL.api.me.phone))}">Send ticket #${BL.token(r)} to rider</a>${r.kind === "parcel" && secret && secret.recipient_phone ? BL.h`<a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink(secret.recipient_phone, BL.recipientNote({ ...r, recipient_name: secret.recipient_name }, BL.api.me.name))}">Tell the recipient</a>` : ""}` : "");
  const mapsBtn = (r) => BL.h`<a class="maps" target="_blank" rel="noopener" href="${BL.mapsRoute({ text: r.pickup, lat: r.pickup_lat, lng: r.pickup_lng }, { text: r.dropoff })}">Route in Google Maps</a>`;
  const kindBadge = (r) => BL.h`<span class="badge ${r.kind === "parcel" ? "badge--parcel" : "badge--ok"}">${r.kind === "parcel" ? "Parcel" : "Boda ride"}</span>`;
  const codeCard = () => BL.h`<div class="card card--flat center"><p class="small muted">Pickup code. Give it to the rider when they collect the parcel.</p><div class="money" style="font-size:38px;letter-spacing:.2em">${secret ? secret.code : ""}</div></div>`;

  function viewActive(r) {
    const p = r.kind === "parcel";
    const head = BL.h`<div class="row between">${kindBadge(r)}<span class="badge">${LABEL[r.status]}</span></div>`;
    const item = p ? BL.h`<p class="small"><b>${r.item}</b>, ${SIZE[r.weight]} parcel${secret ? ", for " + secret.recipient_name : ""}</p>` : "";
    if (r.status === "bidding") {
      const left = Math.max(0, Math.round((BL.date(r.bidding_ends).getTime() - Date.now()) / 1000));
      return BL.h`<div class="card stack">${head}${route(r)}${item}
        <div class="row between"><div><b>${left > 0 ? "Riders are bidding" : "Picking the best bid"}</b><p class="hint">Riders set their own prices.${r.auto_accept ? " We take the first bid at or under " + BL.money(r.max_price) + "." : ""}</p></div>
          <div class="ring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/><circle cx="22" cy="22" r="18" id="ringC" style="stroke-dashoffset:${113.1 * (1 - left / BL.cfg.bid_seconds)}"/></svg><span id="ringT">${left}</span></div></div>
        ${bids.length ? bids.map((b) => BL.h`<div class="item"><div class="avatar">${BL.initials(b.rider_name)}</div>
          <div class="grow"><div class="t">${b.rider_name}</div><div class="s">${b.rider_plate}, ${BL.stars(b.rider_rating)}${dist(b) ? ", " + dist(b) : ""}</div></div>
          <b class="money" style="font-size:19px">${BL.money(b.amount)}</b><button class="btn btn--green btn--sm" data-act="accept" data-id="${b.id}">Accept</button></div>`)
          : BL.h`<div class="empty"><div class="pulse"></div><p style="margin-top:22px">Asking riders near you. Bids appear here.</p></div>`}
        <button class="btn btn--soft btn--block" data-act="cancel">Cancel request</button></div>`;
    }
    return BL.h`<div class="card stack">${head}${route(r)}${item}
      <div class="row"><div class="avatar">${BL.initials(r.rider_name)}</div><div class="grow"><div class="t">${r.rider_name}</div><div class="s">${r.rider_plate}</div></div>
        <b class="money" style="font-size:20px">${BL.money(r.fare)}</b></div>
      ${p && r.status === "assigned" ? codeCard() : ""}
      ${steps(r)}
      <div class="row wrap">${contact ? BL.h`<a class="btn btn--dark grow" href="${BL.tel(contact.phone)}">Call rider</a>
        <a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink(contact.phone, "Hi " + r.rider_name.split(" ")[0] + ", I am your BodaLink " + (p ? "sender" : "passenger") + " at " + r.pickup + ".")}">WhatsApp</a>` : ""}
        <a class="btn btn--soft grow" target="_blank" rel="noopener" href="${BL.waLink("", shareText(r))}">Share trip</a>${mapsBtn(r)}${ticketBtns(r)}</div>
      ${r.status === "assigned" ? BL.h`<button class="btn btn--danger btn--block" data-act="cancel">Cancel trip</button>` : ""}
      <p class="hint">${payLine(r)}</p></div>`;
  }

  function viewFinished(r) {
    if (r.status === "done") {
      return BL.h`<div class="card stack center"><h2>${r.kind === "ride" ? "You have arrived" : "Parcel delivered"}</h2>
        <p class="muted">${r.rider_name}, ${r.rider_plate}. Price ${BL.money(r.fare)}.</p>
        ${r.rating ? BL.h`<p>You rated this trip ${r.rating} of 5. Thank you.</p>` : BL.h`<p class="label">How was ${r.rider_name.split(" ")[0]}?</p>
          <div class="stars" style="justify-content:center">${[1, 2, 3, 4, 5].map((n) => BL.h`<button data-act="rate" data-n="${n}" aria-label="${n} stars">★</button>`)}</div>`}
        <a class="btn btn--green btn--block" href="#/book">Book another</a></div>`;
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
    BL.html(BL.$("#tHist", sec), past.length ? BL.h`${past.map((r) => BL.h`<div class="item">${kindBadge(r)}
      <div class="grow"><div class="t">${r.pickup} to ${r.dropoff}</div><div class="s">${BL.ago(r.created)}, ${LABEL[r.status]}</div></div><b class="money">${r.status === "done" ? BL.money(r.fare) : ""}</b></div>`)}`
      : BL.h`<div class="empty">Your trips will show up here.</div>`);
  }

  async function load() {
    const me = BL.api.me;
    try {
      items = await BL.api.list("requests", { filter: 'passenger = "' + me.id + '"', sort: "-created", perPage: 20 });
      active = items.find((r) => ACTIVE.indexOf(r.status) > -1) || null;
      bids = []; secret = null; contact = null;
      if (active) {
        const jobs = [];
        if (active.status === "bidding") jobs.push(BL.api.list("bids", { filter: 'request = "' + active.id + '" && status = "open"', sort: "amount" }).then((b) => (bids = b)));
        if (active.kind === "parcel") jobs.push(BL.api.list("secrets", { filter: 'request = "' + active.id + '"' }).then((s) => (secret = s[0] || null)));
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
