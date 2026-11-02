/* Rider: go online, bid on rides, claim parcels, run the active job, manage float, finish verification. */
(function () {
  const BL = (window.BL = window.BL || {});
  const q = (s) => String(s).replace(/["\\]/g, "");
  let sec, rider = null, jobs = [], mine = {}, job = null, passenger = null, unsubs = [], ticker = null, beat = null, pending = null;

  const myRider = async () => { const l = await BL.api.list("riders", { filter: 'member = "' + BL.api.me.id + '"', perPage: 1 }); rider = l[0] || null; return rider; };
  const patchRider = async (data) => { rider = await BL.api.update("riders", rider.id, data); return rider; };
  const soon = (fn) => { clearTimeout(pending); pending = setTimeout(fn, 250); };

  /* ---------- jobs screen ---------- */
  function paintStatus() {
    const me = BL.api.me, $ = (s) => BL.$(s, sec), min = BL.cfg.min_float;
    $("#rHello").textContent = "Hi " + me.name.split(" ")[0];
    $("#rState").textContent = rider.online ? "You are online" : "You are offline";
    $("#rPlate").textContent = rider.plate;
    const go = $("#rGo");
    go.textContent = rider.online ? "Go offline" : "Go online";
    go.className = "btn btn--lg btn--block go " + (rider.online ? "btn--dark" : "btn--green");
    BL.html($("#rStages"), BL.h`${BL.stages.map((s) => BL.h`<button class="chip" data-act="stage" data-id="${s.id}" aria-pressed="${s.id === rider.stage}">${s.name}</button>`)}`);
    $("#rFloat").textContent = BL.money(rider.float);
    $("#rBar").style.width = Math.min(100, (rider.float / 500) * 100) + "%";
    $("#rBar").style.background = rider.float < min ? "var(--red)" : "var(--green)";
    $("#rMin").style.left = (min / 500) * 100 + "%";
    $("#rFloatHint").innerHTML = rider.float < min ? 'Below KSh ' + min + ', you cannot go online. <a href="#/float"><b>Top up now</b></a>' : "You stay online while your float is above " + BL.money(min) + ".";
    const msg = { pending: ["Your account is in review", "Finish your documents and starting float. We review riders within a day.", "#/join", "Open checklist", "warn"],
      rejected: ["Verification needs attention", me.reject_reason || "Open your checklist to see what to fix.", "#/join", "Fix it", "err"],
      suspended: ["Account suspended", "Contact BodaLink to find out why.", "", "", "err"] }[me.status];
    BL.html($("#rBanner"), msg ? BL.h`<div class="card ${msg[4] === "err" ? "" : "card--flat"}" style="border-color:var(--${msg[4] === "err" ? "red" : "amber"})"><b>${msg[0]}</b><p class="small muted" style="margin:4px 0 10px">${msg[1]}</p>${msg[2] ? BL.h`<a class="btn btn--dark btn--sm" href="${msg[2]}">${msg[3]}</a>` : ""}</div>` : "");
  }

  function quick(sug) { return [...new Set([sug * 0.8, sug, sug * 1.2, sug * 1.4].map((n) => Math.max(50, Math.round(n / 10) * 10)))]; }

  function paintJobs() {
    const list = jobs.filter((j) => (j.kind === "parcel" || j.pickup_stage === rider.stage) && (!job || j.id !== job.id));
    BL.$("#rCount", sec).textContent = rider.online ? list.length : 0;
    const box = BL.$("#rJobs", sec);
    if (!rider.online) return BL.html(box, BL.h`<div class="card empty"><h3>You are offline</h3><p>Go online to see rides and parcels at your stage.</p></div>`);
    if (job) return BL.html(box, BL.h`<div class="card empty"><p>Finish your current job to see new ones.</p></div>`);
    if (!list.length) return BL.html(box, BL.h`<div class="card empty"><div class="pulse"></div><p style="margin-top:24px">Waiting for jobs at ${BL.stageName(rider.stage)}. We will beep when one lands.</p></div>`);
    BL.html(box, BL.h`${list.map((j) => {
      if (j.kind === "parcel") {
        return BL.h`<article class="card stack job job--parcel"><div class="row between"><span class="badge badge--parcel">Quickshelf parcel</span><b class="money" style="font-size:22px">${BL.money(j.payout)}</b></div>
          <div class="route"><p>${j.merchant}</p><p>${j.dropoff}</p></div><p class="hint">Fixed fee ${BL.money(j.fee)}. You keep 85% as payout. First to claim gets it.</p>
          <button class="btn btn--amber btn--lg btn--block" data-act="claim" data-id="${j.id}">Claim this job</button></article>`;
      }
      const m = mine[j.id], left = Math.max(0, Math.round((BL.date(j.bidding_ends).getTime() - Date.now()) / 1000));
      return BL.h`<article class="card stack job" data-ends="${j.bidding_ends}"><div class="row between"><span class="badge badge--ok">Boda ride</span><span class="badge" data-left>${left}s left</span></div>
        <div class="route"><p>${j.pickup}</p><p>${j.dropoff}</p></div>
        <p class="hint">Suggested ${BL.money(j.suggested)}.${j.auto_accept ? " Passenger takes the first bid up to " + BL.money(j.max_price) + "." : ""} BodaLink takes 15% from your float when you finish.</p>
        <div class="bids">${quick(j.suggested).map((n) => BL.h`<button class="bid" data-act="bid" data-id="${j.id}" data-amt="${n}" aria-pressed="${!!m && m.amount === n}">${n}</button>`)}</div>
        <div class="row"><input class="input grow" inputmode="numeric" placeholder="Your own price" data-custom="${j.id}"><button class="btn btn--dark" data-act="custom" data-id="${j.id}">Bid</button></div>
        ${m ? BL.h`<p class="hint"><b>Your bid is ${BL.money(m.amount)}.</b> You can change it until bidding closes.</p>` : ""}</article>`;
    })}`);
  }

  function paintJob() {
    const box = BL.$("#rActive", sec);
    if (!job) return BL.html(box, "");
    const p = job.kind === "parcel", picked = job.status === "picked";
    BL.html(box, BL.h`<div class="card stack" style="border:2px solid var(--${p ? "amber" : "green"})">
      <div class="row between"><span class="badge ${p ? "badge--parcel" : "badge--ok"}">${p ? "Parcel" : "Ride"}, ${picked ? "in progress" : "go to pickup"}</span><b class="money" style="font-size:22px">${BL.money(p ? job.payout : job.fare)}</b></div>
      <div class="route"><p>${job.pickup}</p><p>${job.dropoff}</p></div>
      ${passenger ? BL.h`<div class="row"><div class="avatar">${BL.initials(passenger.name)}</div><div class="grow"><div class="t">${passenger.name}${passenger.verified ? " ✓" : ""}</div><div class="s">+${passenger.phone}</div></div>
        <a class="btn btn--soft btn--sm" href="${BL.tel(passenger.phone)}">Call</a><a class="btn btn--soft btn--sm" target="_blank" rel="noopener" href="${BL.waLink(passenger.phone, "Hi, this is your BodaLink rider " + BL.api.me.name.split(" ")[0] + ", plate " + rider.plate + ". I am on my way.")}">WhatsApp</a></div>` : ""}
      ${p && !picked ? BL.h`<div class="field"><label for="rCode">Pickup code from the sender</label><input class="input pin" id="rCode" inputmode="numeric" maxlength="4"></div>` : ""}
      ${!p ? BL.h`<p class="hint">${picked ? "Collect " + BL.money(job.fare) + " in cash. BodaLink takes " + BL.money(job.platform_fee) + " from your float." : "Cash fare " + BL.money(job.fare) + "."}</p>` : ""}
      <button class="btn btn--green btn--lg btn--block" data-act="${picked ? "complete" : "start"}" data-id="${job.id}">${picked ? (p ? "Mark delivered" : "Complete ride") : (p ? "Confirm pickup" : "Start ride")}</button>
      ${!picked ? BL.h`<button class="btn btn--soft btn--block" data-act="release" data-id="${job.id}">Drop this job</button>` : ""}</div>`);
  }

  async function loadJobs() {
    try {
      const [js, bs, act] = await Promise.all([
        BL.api.list("requests", { filter: 'status = "bidding" || status = "open"', sort: "-created", perPage: 30 }).catch(() => []),
        BL.api.list("bids", { filter: 'status = "open" && rider = "' + rider.id + '"', perPage: 50 }).catch(() => []),
        BL.api.list("requests", { filter: 'rider = "' + rider.id + '" && (status = "assigned" || status = "picked")', perPage: 1 }),
      ]);
      const before = jobs.length;
      jobs = js; mine = {}; bs.forEach((b) => (mine[b.request] = b));
      const had = job && job.id; job = act[0] || null;
      if (job && (!passenger || had !== job.id)) passenger = await BL.api.get("/api/bl/contact?request=" + job.id).catch(() => null);
      if (!job) passenger = null;
      if (jobs.length > before && rider.online) BL.beep();
    } catch (e) { BL.toast(e.message, "err"); }
    paintJob(); paintJobs();
  }

  async function act(b) {
    const a = b.dataset.act, id = b.dataset.id;
    const post = (path, body) => BL.api.post(path, body);
    if (a === "stage") return patchRider({ stage: id }).then(() => { paintStatus(); paintJobs(); }).catch((e) => BL.toast(e.message, "err"));
    if (a === "bid" || a === "custom") {
      const amt = a === "bid" ? +b.dataset.amt : parseInt((BL.$('[data-custom="' + id + '"]', sec).value || "").replace(/\D/g, ""), 10);
      if (!(amt >= 50 && amt <= 2000)) return BL.toast("Enter a price between KSh 50 and KSh 2,000.", "err");
      return BL.busy(b, async () => {
        const m = mine[id];
        mine[id] = m ? await BL.api.update("bids", m.id, { amount: amt }) : await BL.api.create("bids", { request: id, amount: amt });
        BL.toast("Bid of " + BL.money(amt) + " sent.", "ok"); paintJobs();
      });
    }
    if (a === "claim") return BL.busy(b, async () => { await post("/api/bl/claim", { request: id }); BL.toast("It is yours.", "ok"); await loadJobs(); });
    if (a === "start") {
      const code = job.kind === "parcel" ? (BL.$("#rCode", sec).value || "").trim() : "";
      if (job.kind === "parcel" && code.length !== 4) return BL.toast("Ask the sender for the 4 digit code.", "err");
      return BL.busy(b, async () => { await post("/api/bl/pickup", { request: id, code }); await loadJobs(); });
    }
    if (a === "complete") return BL.busy(b, async () => { const r = await post("/api/bl/complete", { request: id }); rider.float = r.float; BL.toast("Done. Float is now " + BL.money(r.float) + ".", "ok"); await myRider(); paintStatus(); await loadJobs(); });
    if (a === "release" && (await BL.confirm("Drop this job?", "It goes back out to other riders.", "Drop job"))) return BL.busy(b, async () => { await post("/api/bl/release", { request: id }); await loadJobs(); });
  }

  BL.views.rider = {
    mount(s) {
      sec = s;
      BL.$("#rGo", sec).onclick = (e) => BL.busy(e.currentTarget, async () => { await patchRider({ online: !rider.online }); paintStatus(); await loadJobs(); BL.toast(rider.online ? "You are online." : "You are offline.", rider.online ? "ok" : ""); });
      sec.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) act(b); });
    },
    async show() {
      if (!(await myRider())) return BL.toast("Rider profile missing. Contact BodaLink.", "err");
      await BL.loadStages();
      paintStatus(); await loadJobs();
      unsubs = [BL.realtime.on("requests/*", () => soon(loadJobs)), BL.realtime.on("bids/*", () => soon(loadJobs)),
        BL.realtime.on("riders/*", (ev) => { if (ev.record.id === rider.id) { rider = ev.record; paintStatus(); paintJobs(); } })];
      clearInterval(ticker); clearInterval(beat);
      ticker = setInterval(() => BL.$$("[data-ends]", sec).forEach((c) => { const l = Math.max(0, Math.round((BL.date(c.dataset.ends).getTime() - Date.now()) / 1000)); BL.$("[data-left]", c).textContent = l + "s left"; }), 1000);
      beat = setInterval(() => { if (rider && rider.online && !document.hidden) patchRider({ online: true }).catch(() => {}); }, 45000);
    },
    hide() { unsubs.forEach((u) => u()); unsubs = []; clearInterval(ticker); clearInterval(beat); },
  };

  /* ---------- float ---------- */
  let amount = 300, poll = null;
  BL.views.float = {
    mount(s) {
      const $ = (x) => BL.$(x, s);
      BL.html($("#fChips"), BL.h`${[200, 300, 500, 1000].map((n) => BL.h`<button class="chip" data-amt="${n}" aria-pressed="${n === amount}">${BL.money(n)}</button>`)}`);
      s.addEventListener("click", (e) => {
        const c = e.target.closest("[data-amt]");
        if (c) { amount = +c.dataset.amt; $("#fAmt").value = ""; BL.$$("#fChips .chip", s).forEach((x) => x.setAttribute("aria-pressed", x === c)); }
      });
      $("#fGo").onclick = (e) => {
        const typed = parseInt($("#fAmt").value.replace(/\D/g, ""), 10);
        const amt = typed || amount;
        if (!(amt >= 100 && amt <= 5000)) return BL.toast("Top up between KSh 100 and KSh 5,000.", "err");
        BL.busy(e.currentTarget, async () => {
          const before = rider.float;
          const r = await BL.api.post("/api/bl/topup", { amount: amt });
          if (r.status === "paid") { BL.toast("Float topped up.", "ok"); return BL.views.float.show(s); }
          $("#fMsg").hidden = false; $("#fMsg").textContent = "Check your phone and enter your M-Pesa PIN.";
          clearInterval(poll); let n = 0;
          poll = setInterval(async () => { await myRider(); if (rider.float !== before || ++n > 25) { clearInterval(poll); BL.views.float.show(s); } }, 4000);
        });
      };
    },
    async show(s) {
      const $ = (x) => BL.$(x, s), min = BL.cfg.min_float;
      await myRider();
      $("#fBal").textContent = BL.money(rider.float);
      $("#fBar").style.width = Math.min(100, (rider.float / 500) * 100) + "%";
      $("#fMin").style.left = (min / 500) * 100 + "%";
      $("#fHint").textContent = rider.float < min ? "Add at least " + BL.money(min - rider.float) + " to go online." : "You are above the " + BL.money(min) + " minimum.";
      $("#fMsg").hidden = true;
      const [led, done] = await Promise.all([
        BL.api.list("ledger", { sort: "-created", perPage: 30 }).catch(() => []),
        BL.api.list("requests", { filter: 'rider = "' + rider.id + '" && status = "done"', sort: "-done_at", perPage: 100 }).catch(() => []),
      ]);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const earn = (since) => done.filter((r) => BL.date(r.done_at) >= since).reduce((a, r) => a + (r.kind === "ride" ? r.fare : r.payout), 0);
      $("#eToday").textContent = BL.money(earn(start));
      $("#eWeek").textContent = BL.money(earn(new Date(start - 6 * 86400000)));
      const names = { ride_fee: "Ride fee, 15%", parcel_payout: "Parcel payout", topup: "M-Pesa top-up", adjustment: "Adjustment" };
      BL.html($("#fLedger"), led.length ? BL.h`${led.map((l) => BL.h`<div class="item"><div class="grow"><div class="t">${names[l.kind]}</div><div class="s">${l.note}, ${BL.ago(l.created)}</div></div>
        <div style="text-align:right"><b class="money" style="color:var(--${l.amount < 0 ? "red" : "green-600"})">${l.amount < 0 ? "-" : "+"}${BL.money(Math.abs(l.amount))}</b><div class="s">${BL.money(l.balance_after)}</div></div></div>`)}`
        : BL.h`<div class="empty">Your top-ups and fees will show up here.</div>`);
    },
    hide() { clearInterval(poll); },
  };

  /* ---------- verification checklist ---------- */
  const shrink = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that photo."))), "image/jpeg", 0.82);
    };
    img.onerror = () => reject(new Error("Could not read that photo."));
    img.src = URL.createObjectURL(file);
  });

  BL.views.join = {
    mount(s) {
      s.addEventListener("change", async (e) => {
        const inp = e.target.closest(".file input"); if (!inp || !inp.files[0]) return;
        const box = inp.closest(".file"), field = box.dataset.f;
        box.classList.add("busy");
        try {
          const blob = await shrink(inp.files[0]);
          const fd = new FormData(); fd.append(field, blob, field + ".jpg");
          rider = await BL.api.req("PATCH", "/api/collections/riders/records/" + rider.id, fd);
          BL.toast("Photo saved.", "ok");
          BL.views.join.show(s);
        } catch (er) { BL.toast(er.message, "err"); }
        box.classList.remove("busy");
      });
    },
    async show(s) {
      await BL.api.refresh(); await myRider();
      const me = BL.api.me, ok = me.status === "approved";
      const steps = [["Account created", true], ["Phone verified", me.phone_verified], ["National ID number given", !!me.national_id],
        ["ID photo uploaded", !!rider.id_photo], ["Selfie with ID uploaded", !!rider.selfie], ["Bike and plate photo uploaded", !!rider.bike_photo],
        ["Starting float of " + BL.money(BL.cfg.min_float) + " or more", rider.float >= BL.cfg.min_float], ["BodaLink review", ok]];
      const firstOpen = steps.findIndex((x) => !x[1]);
      BL.html(BL.$("#jSteps", s), BL.h`${steps.map(([t, d], i) => BL.h`<li class="${d ? "done" : i === firstOpen ? "now" : ""}">${t}</li>`)}`);
      const st = { approved: ["You are verified", "Go online and start taking jobs.", "ok"], pending: ["In review", "Finish the checklist. We review within a day and send you an alert.", "warn"],
        rejected: ["Needs attention", me.reject_reason || "Fix the items below and we will look again.", "err"], suspended: ["Suspended", "Contact BodaLink.", "err"] }[me.status];
      BL.html(BL.$("#jStatus", s), BL.h`<span class="badge badge--${st[2]}">${st[0]}</span><p style="margin-top:8px">${st[1]}</p>${ok ? BL.h`<a class="btn btn--green" style="margin-top:12px" href="#/rider">Go to jobs</a>` : ""}`);
      const tok = rider.id_photo || rider.selfie || rider.bike_photo ? await BL.api.fileToken().catch(() => "") : "";
      BL.$$(".file", s).forEach((box) => {
        const f = box.dataset.f, img = BL.$("img", box); if (img) img.remove();
        box.classList.toggle("done", !!rider[f]);
        BL.$("span", box).textContent = rider[f] ? "Saved. Tap to replace" : BL.$("span", box).textContent.replace("Saved. Tap to replace", "Tap to take a photo");
        if (rider[f] && tok) { const i = document.createElement("img"); i.alt = ""; i.src = BL.api.fileUrl(rider, f, tok); box.prepend(i); }
      });
    },
  };
})();
