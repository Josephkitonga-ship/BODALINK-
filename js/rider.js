/* Rider: go online with a day pass, bid on rides and parcels, run the active job, finish verification. */
(function () {
  const BL = (window.BL = window.BL || {});
  let sec, rider = null, jobs = [], mine = {}, job = null, contact = null, unsubs = [], ticker = null, beat = null, pending = null;
  const here = () => (rider && rider.lat ? { lat: rider.lat, lng: rider.lng } : null);
  // Share the rider's location when the phone allows it. It only helps passengers see who is near.
  const share = async () => { try { const p = await BL.locate(); return { lat: p.lat, lng: p.lng, loc_at: new Date().toISOString().replace("T", " ") }; } catch (_) { return {}; } };
  const SIZE = { small: "Small", medium: "Medium", large: "Large" };

  const myRider = async () => { const l = await BL.api.list("riders", { filter: 'member = "' + BL.api.me.id + '"', perPage: 1 }); rider = l[0] || null; return rider; };
  const patchRider = async (data) => { rider = await BL.api.update("riders", rider.id, data); return rider; };
  const soon = (fn) => { clearTimeout(pending); pending = setTimeout(fn, 250); };
  const passUntil = () => (rider && rider.pass_until ? BL.date(rider.pass_until) : null);
  const passOn = () => { const d = passUntil(); return !!d && d.getTime() > Date.now(); };
  const passText = () => {
    const d = passUntil();
    if (!passOn()) return ["No active pass", "Buy " + BL.cfg.pass_hours + " hours for " + BL.money(BL.cfg.pass_price) + " to go online. Riders keep every shilling of every fare."];
    const h = Math.max(1, Math.round((d.getTime() - Date.now()) / 3600000));
    return ["Until " + BL.clock(rider.pass_until), "About " + h + " hour" + (h > 1 ? "s" : "") + " left. You keep every shilling of every fare."];
  };

  /* ---------- jobs screen ---------- */
  function paintStatus() {
    const me = BL.api.me, $ = (s) => BL.$(s, sec);
    $("#rHello").textContent = "Hi " + me.name.split(" ")[0];
    $("#rState").textContent = rider.online ? "You are online" : "You are offline";
    $("#rPlate").textContent = rider.plate;
    const go = $("#rGo");
    go.textContent = rider.online ? "Go offline" : "Go online";
    go.className = "btn btn--lg btn--block go " + (rider.online ? "btn--dark" : "btn--green");
    $("#rLoc").textContent = rider.lat ? "Shared" : "Not shared";
    const [t, hint] = passText();
    $("#rPass").textContent = t; $("#rPassHint").textContent = hint;
    const msg = { pending: ["Your account is in review", "Finish your documents. We review riders within a day, and your first 24 hours online are free.", "#/join", "Open checklist", "warn"],
      rejected: ["Verification needs attention", me.reject_reason || "Open your checklist to see what to fix.", "#/join", "Fix it", "err"],
      suspended: ["Account suspended", "Contact BodaLink to find out why.", "", "", "err"] }[me.status];
    const buy = !msg && !passOn() ? ["Buy a day pass to go online", BL.money(BL.cfg.pass_price) + " for " + BL.cfg.pass_hours + " hours, paid by M-Pesa.", "#/pass", "Buy pass", "warn"] : null;
    const m = msg || buy;
    BL.html($("#rBanner"), m ? BL.h`<div class="card ${m[4] === "err" ? "" : "card--flat"}" style="border-color:var(--${m[4] === "err" ? "red" : "amber"})"><b>${m[0]}</b><p class="small muted" style="margin:4px 0 10px">${m[1]}</p>${m[2] ? BL.h`<a class="btn btn--dark btn--sm" href="${m[2]}">${m[3]}</a>` : ""}</div>` : "");
  }

  
  const pickupSpot = (j) => ({ text: j.pickup, lat: j.pickup_lat, lng: j.pickup_lng });
  const away = (j) => BL.km(here(), j.pickup_lat ? { lat: j.pickup_lat, lng: j.pickup_lng } : null);

  function paintJobs() {
    const list = jobs.filter((j) => !job || j.id !== job.id).sort((x, y) => (away(x) === null) - (away(y) === null) || (away(x) || 0) - (away(y) || 0));
    BL.$("#rCount", sec).textContent = rider.online ? list.length : 0;
    const box = BL.$("#rJobs", sec);
    if (!rider.online) return BL.html(box, BL.h`<div class="card empty"><h3>You are offline</h3><p>Go online to see rides and parcels near you.</p></div>`);
    if (job) return BL.html(box, BL.h`<div class="card empty"><p>Finish your current job to see new ones.</p></div>`);
    if (!list.length) return BL.html(box, BL.h`<div class="card empty"><div class="pulse"></div><p style="margin-top:24px">Waiting for jobs. We will beep when one lands.</p></div>`);
    BL.html(box, BL.h`${list.map((j) => {
      const p = j.kind === "parcel", m = mine[j.id], left = Math.max(0, Math.round((BL.date(j.bidding_ends).getTime() - Date.now()) / 1000)), d = BL.kmText(away(j));
      return BL.h`<article class="card stack job ${p ? "job--parcel" : ""}" data-ends="${j.bidding_ends}"><div class="row between"><span class="row" style="gap:6px"><span class="badge ${p ? "badge--parcel" : "badge--ok"}">${p ? "Parcel" : "Boda ride"}</span>${d ? BL.h`<span class="badge">${d}</span>` : ""}</span><span class="badge" data-left>${left}s left</span></div>
        <div class="route"><p>${j.pickup}${j.pickup_note ? BL.h`<small class="muted" style="display:block;font-weight:500">${j.pickup_note}</small>` : ""}</p><p>${j.dropoff}</p></div>
        ${p ? BL.h`<p class="small"><b>${j.item}</b>, ${SIZE[j.weight]} parcel. ${j.payer === "recipient" ? "Recipient pays you on delivery." : "Sender pays you at pickup."}</p>` : ""}
        <div class="row wrap"><a class="maps" target="_blank" rel="noopener" href="${BL.mapsRoute(pickupSpot(j), { text: j.dropoff })}">See route in Google Maps</a></div>
        ${j.auto_accept ? BL.h`<p class="hint">They take the first bid up to ${BL.money(j.max_price)}.</p>` : ""}
        <div class="bids">${BL.QUICK_BIDS.map((n) => BL.h`<button class="bid" data-act="bid" data-id="${j.id}" data-amt="${n}" aria-pressed="${!!m && m.amount === n}">${n}</button>`)}</div>
        <div class="row"><input class="input grow" inputmode="numeric" placeholder="Your own price" data-custom="${j.id}"><button class="btn btn--dark" data-act="custom" data-id="${j.id}">Bid</button></div>
        <p class="hint">You set the price and keep all of it.${m ? BL.h` <b>Your bid is ${BL.money(m.amount)}.</b> You can change it until bidding closes.` : ""}</p></article>`;
    })}`);
  }

  function paintJob() {
    const box = BL.$("#rActive", sec);
    if (!job) return BL.html(box, "");
    const p = job.kind === "parcel", picked = job.status === "picked";
    const who = contact ? BL.h`<div class="row"><div class="avatar">${BL.initials(contact.name)}</div><div class="grow"><div class="t">${contact.name}${contact.verified ? " ✓" : ""}</div><div class="s">${p ? "Sender" : "Passenger"} +${contact.phone}</div></div>
        <a class="btn btn--soft btn--sm" href="${BL.tel(contact.phone)}">Call</a><a class="btn btn--soft btn--sm" target="_blank" rel="noopener" href="${BL.waLink(contact.phone, "Hi, this is your BodaLink rider " + BL.api.me.name.split(" ")[0] + ", plate " + rider.plate + ". I am on my way.")}">WhatsApp</a></div>` : "";
    const recip = p && contact && contact.recipient_phone ? BL.h`<div class="row"><div class="avatar" style="background:var(--amber);color:#1F1500">${BL.initials(contact.recipient_name)}</div><div class="grow"><div class="t">${contact.recipient_name}</div><div class="s">Recipient +${contact.recipient_phone}</div></div>
        <a class="btn btn--soft btn--sm" href="${BL.tel(contact.recipient_phone)}">Call</a></div>` : "";
    BL.html(box, BL.h`<div class="card stack" style="border:2px solid var(--${p ? "amber" : "green"})">
      <div class="row between"><span class="badge ${p ? "badge--parcel" : "badge--ok"}">${p ? "Parcel" : "Ride"}, ${picked ? "in progress" : "go to pickup"}</span><b class="money" style="font-size:22px">${BL.money(job.fare)}</b></div>
      <div class="route"><p>${job.pickup}${job.pickup_note ? BL.h`<small class="muted" style="display:block;font-weight:500">${job.pickup_note}</small>` : ""}</p><p>${job.dropoff}</p></div>
      ${p ? BL.h`<p class="small"><b>${job.item}</b>, ${SIZE[job.weight]} parcel</p>` : ""}${who}${recip}
      <div class="row wrap"><a class="maps" target="_blank" rel="noopener" href="${BL.mapsRoute(null, pickupSpot(job))}">Navigate to pickup</a><a class="maps" target="_blank" rel="noopener" href="${BL.mapsRoute(pickupSpot(job), { text: job.dropoff })}">Navigate to drop-off</a></div>
      <p class="hint">${p ? (job.payer === "recipient" ? "Collect " + BL.money(job.fare) + " from the recipient on delivery." : "The sender pays you " + BL.money(job.fare) + " at pickup.") : "Collect " + BL.money(job.fare) + " in cash from the passenger."}</p>
      ${p && !picked ? BL.h`<div class="field"><label for="rCode">Pickup code from the sender</label><input class="input pin" id="rCode" inputmode="numeric" maxlength="4"></div>` : ""}
      <button class="btn btn--green btn--lg btn--block" data-act="${picked ? "complete" : "start"}" data-id="${job.id}">${picked ? (p ? "Mark delivered" : "Complete ride") : (p ? "Confirm pickup" : "Start ride")}</button>
      ${!picked ? BL.h`<button class="btn btn--soft btn--block" data-act="release" data-id="${job.id}">Drop this job</button>` : ""}</div>`);
  }

  async function loadJobs() {
    try {
      const [js, bs, act] = await Promise.all([
        BL.api.list("requests", { filter: 'status = "bidding"', sort: "-created", perPage: 30 }).catch(() => []),
        BL.api.list("bids", { filter: 'status = "open" && rider = "' + rider.id + '"', perPage: 50 }).catch(() => []),
        BL.api.list("requests", { filter: 'rider = "' + rider.id + '" && (status = "assigned" || status = "picked")', perPage: 1 }),
      ]);
      const before = jobs.length, had = job && job.id;
      jobs = js; mine = {}; bs.forEach((b) => (mine[b.request] = b));
      job = act[0] || null;
      if (job && (!contact || had !== job.id)) contact = await BL.api.get("/api/bl/contact?request=" + job.id).catch(() => null);
      if (!job) contact = null;
      if (jobs.length > before && rider.online) BL.beep();
    } catch (e) { BL.toast(e.message, "err"); }
    paintJob(); paintJobs();
  }

  async function act(b) {
    const a = b.dataset.act, id = b.dataset.id;
    const post = (path, body) => BL.api.post(path, body);
    if (a === "bid" || a === "custom") {
      const amt = a === "bid" ? +b.dataset.amt : parseInt((BL.$('[data-custom="' + id + '"]', sec).value || "").replace(/\D/g, ""), 10);
      if (!(amt >= 50 && amt <= 2000)) return BL.toast("Enter a price between KSh 50 and KSh 2,000.", "err");
      return BL.busy(b, async () => {
        const m = mine[id];
        mine[id] = m ? await BL.api.update("bids", m.id, { amount: amt }) : await BL.api.create("bids", { request: id, amount: amt });
        BL.toast("Bid of " + BL.money(amt) + " sent.", "ok"); paintJobs();
      });
    }
    if (a === "start") {
      const code = job.kind === "parcel" ? (BL.$("#rCode", sec).value || "").trim() : "";
      if (job.kind === "parcel" && code.length !== 4) return BL.toast("Ask the sender for the 4 digit code.", "err");
      return BL.busy(b, async () => { await post("/api/bl/pickup", { request: id, code }); await loadJobs(); });
    }
    if (a === "complete") return BL.busy(b, async () => { await post("/api/bl/complete", { request: id }); BL.toast("Done. Well done.", "ok"); await loadJobs(); });
    if (a === "release" && (await BL.confirm("Drop this job?", "It goes back out for bids from other riders.", "Drop job"))) return BL.busy(b, async () => { await post("/api/bl/release", { request: id }); await loadJobs(); });
  }

  BL.views.rider = {
    mount(s) {
      sec = s;
      BL.$("#rGo", sec).onclick = (e) => {
        if (!rider.online && !passOn() && BL.api.me.status === "approved") { BL.toast("Buy a day pass to go online.", "err"); location.hash = "#/pass"; return; }
        BL.busy(e.currentTarget, async () => { await patchRider({ online: !rider.online, ...(rider.online ? {} : await share()) }); paintStatus(); await loadJobs(); BL.toast(rider.online ? "You are online." : "You are offline.", rider.online ? "ok" : ""); });
      };
      sec.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) act(b); });
    },
    async show() {
      if (!(await myRider())) return BL.toast("Rider profile missing. Contact BodaLink.", "err");
      await BL.api.refresh();
      paintStatus(); await loadJobs();
      BL.deck.mount(BL.$("#rDeck", sec));
      unsubs = [BL.realtime.on("requests/*", () => soon(loadJobs)), BL.realtime.on("bids/*", () => soon(loadJobs)),
        BL.realtime.on("riders/*", (ev) => { if (ev.record.id === rider.id) { rider = ev.record; paintStatus(); paintJobs(); } })];
      clearInterval(ticker); clearInterval(beat);
      ticker = setInterval(() => {
        BL.$$("[data-ends]", sec).forEach((c) => { const l = Math.max(0, Math.round((BL.date(c.dataset.ends).getTime() - Date.now()) / 1000)); BL.$("[data-left]", c).textContent = l + "s left"; });
        if (rider.online && !passOn()) { rider.online = false; paintStatus(); paintJobs(); BL.toast("Your day pass ended.", "err"); }
      }, 1000);
      beat = setInterval(() => { if (rider && rider.online && !document.hidden) share().then((loc) => patchRider({ online: true, ...loc })).catch(() => {}); }, 45000);
    },
    hide() { unsubs.forEach((u) => u()); unsubs = []; clearInterval(ticker); clearInterval(beat); },
  };

  /* ---------- day pass ---------- */
  let poll = null;
  BL.views.pass = {
    mount(s) {
      const $ = (x) => BL.$(x, s);
      $("#pBuy").onclick = (e) => BL.busy(e.currentTarget, async () => {
        const before = rider.pass_until;
        const r = await BL.api.post("/api/bl/pass/buy");
        if (r.status === "paid") { BL.toast("Day pass active.", "ok"); return BL.views.pass.show(s); }
        $("#pMsg").hidden = false; $("#pMsg").textContent = "Check your phone and enter your M-Pesa PIN.";
        clearInterval(poll); let n = 0;
        poll = setInterval(async () => { await myRider(); if (rider.pass_until !== before || ++n > 25) { clearInterval(poll); BL.views.pass.show(s); } }, 4000);
      });
    },
    async show(s) {
      const $ = (x) => BL.$(x, s);
      await myRider(); await BL.api.refresh();
      const [t, hint] = passText();
      $("#pStatus").textContent = t; $("#pHint").textContent = hint;
      $("#pBuy").textContent = (passOn() ? "Add " : "Buy ") + BL.cfg.pass_hours + " hours for " + BL.money(BL.cfg.pass_price);
      $("#pBuy").disabled = BL.api.me.status !== "approved";
      $("#pMsg").hidden = BL.api.me.status === "approved";
      if (BL.api.me.status !== "approved") $("#pMsg").textContent = "You can buy a pass once BodaLink approves your account. Your first 24 hours are free.";
      const [led, done] = await Promise.all([
        BL.api.list("ledger", { sort: "-created", perPage: 30 }).catch(() => []),
        BL.api.list("requests", { filter: 'rider = "' + rider.id + '" && status = "done"', sort: "-done_at", perPage: 100 }).catch(() => []),
      ]);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const earn = (since) => done.filter((r) => BL.date(r.done_at) >= since).reduce((a, r) => a + r.fare, 0);
      $("#eToday").textContent = BL.money(earn(start));
      $("#eWeek").textContent = BL.money(earn(new Date(start - 6 * 86400000)));
      const names = { pass: "Day pass", free_pass: "Free day", admin_pass: "Free time from BodaLink" };
      BL.html($("#pLedger"), led.length ? BL.h`${led.map((l) => BL.h`<div class="item"><div class="grow"><div class="t">${names[l.kind] || l.kind}</div><div class="s">${l.note}, ${BL.ago(l.created)}</div></div>
        <div style="text-align:right"><b class="money">${l.amount ? BL.money(l.amount) : "Free"}</b><div class="s">until ${BL.clock(l.valid_until)}</div></div></div>`)}`
        : BL.h`<div class="empty">Your passes will show up here.</div>`);
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
      BL.$("#jPrice", s).textContent = BL.money(BL.cfg.pass_price);
      const steps = [["Account created", true], ["Phone verified", me.phone_verified], ["National ID number given", !!me.national_id],
        ["ID photo uploaded", !!rider.id_photo], ["Selfie with ID uploaded", !!rider.selfie], ["Bike and plate photo uploaded", !!rider.bike_photo], ["BodaLink review", ok]];
      const firstOpen = steps.findIndex((x) => !x[1]);
      BL.html(BL.$("#jSteps", s), BL.h`${steps.map(([t, d], i) => BL.h`<li class="${d ? "done" : i === firstOpen ? "now" : ""}">${t}</li>`)}`);
      const st = { approved: ["You are verified", "Open Jobs and go online. Your first 24 hours are free.", "ok"], pending: ["In review", "Finish the checklist. We review within a day and send you an alert.", "warn"],
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
