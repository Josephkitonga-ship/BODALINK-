/* Admin: approve riders, watch dispatch, give free pass time, set day pass price and fare guides. */
(function () {
  const BL = (window.BL = window.BL || {});
  let sec, tab = "over", filter = "pending", unsub = null, pending = null;
  const body = () => BL.$("#aBody", sec);
  const badge = (s) => BL.h`<span class="badge badge--${{ approved: "ok", pending: "warn", rejected: "err", suspended: "err" }[s] || ""}">${s}</span>`;

  async function over() {
    const [online, pend, active, today] = await Promise.all([
      BL.api.count("riders", "online = true"), BL.api.count("members", 'role = "rider" && status = "pending"'),
      BL.api.count("requests", 'status = "bidding" || status = "open" || status = "assigned" || status = "picked"'),
      BL.api.count("requests", 'created >= "' + new Date(new Date().setHours(0, 0, 0, 0)).toISOString().replace("T", " ") + '"'),
    ]);
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString().replace("T", " ");
    const paid = await BL.api.list("ledger", { filter: 'kind = "pass" && created >= "' + dayStart + '"', perPage: 200 });
    const income = paid.reduce((a, l) => a + l.amount, 0);
    const live = await BL.api.list("requests", { filter: 'status = "bidding" || status = "open" || status = "assigned" || status = "picked"', sort: "-created", perPage: 20 });
    const stat = (n, l, go) => BL.h`<${BL.raw(go ? "a" : "div")} class="card card--flat grow" ${BL.raw(go ? 'href="' + go + '"' : "")} style="text-decoration:none"><b class="money" style="font-size:30px">${n}</b><p class="muted small">${l}</p></${BL.raw(go ? "a" : "div")}>`;
    BL.html(body(), BL.h`<div class="row wrap" style="gap:12px">${stat(online, "Riders online")}${stat(active, "Trips in progress")}${stat(today, "Requests today")}${stat(BL.money(income), "Pass income today")}
      <button class="card card--flat grow" data-go="riders" style="text-align:left"><b class="money" style="font-size:30px">${pend}</b><p class="muted small">Riders to review</p></button></div>
      <h3 style="margin:22px 0 4px">Dispatch monitor</h3>
      ${live.length ? live.map((r) => BL.h`<div class="item"><span class="badge ${r.kind === "parcel" ? "badge--parcel" : "badge--ok"}">${r.kind === "parcel" ? "Parcel" : "Ride"}</span>
        <div class="grow"><div class="t">${r.pickup} to ${r.dropoff}</div><div class="s">${r.passenger_name}${r.rider_name ? ", rider " + r.rider_name : ""}, ${BL.ago(r.created)}</div></div><span class="badge">${r.status}</span></div>`)
        : BL.h`<div class="empty">No trips right now.</div>`}`);
  }

  async function riders() {
    const f = { pending: 'member.status = "pending"', approved: 'member.status = "approved"', other: 'member.status = "rejected" || member.status = "suspended"', all: "" }[filter];
    const list = await BL.api.list("riders", { filter: f, expand: "member", sort: "-created", perPage: 60 });
    BL.html(body(), BL.h`<div class="chips" style="margin-bottom:8px">${["pending", "approved", "other", "all"].map((k) => BL.h`<button class="chip" data-filter="${k}" aria-pressed="${k === filter}">${k[0].toUpperCase() + k.slice(1)}</button>`)}</div>
      ${list.length ? list.map((r) => { const m = r.expand.member; return BL.h`<button class="item" data-rider="${r.id}" style="width:100%;text-align:left">
        <div class="avatar">${BL.initials(m.name)}</div><div class="grow"><div class="t">${m.name} ${r.online ? BL.raw('<span style="color:var(--green)">●</span>') : ""}</div><div class="s">${r.plate}, +${m.phone}</div></div>
        <div style="text-align:right">${badge(m.status)}<div class="s">${r.pass_until && BL.date(r.pass_until) > new Date() ? "Pass on" : "No pass"}</div></div></button>`; }) : BL.h`<div class="empty">Nobody here.</div>`}`);
  }

  async function riderSheet(id) {
    const r = await BL.api.one("riders", id, { expand: "member" }), m = r.expand.member;
    const tok = await BL.api.fileToken().catch(() => "");
    const doc = (f, l) => (r[f] ? BL.h`<a href="${BL.api.fileUrl(r, f, tok)}" target="_blank" rel="noopener"><img src="${BL.api.fileUrl(r, f, tok)}" alt="${l}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px"><span class="small muted">${l}</span></a>` : BL.h`<div class="card card--flat empty small">${l} missing</div>`);
    BL.sheet(BL.h`<div class="stack"><div class="row"><div class="avatar">${BL.initials(m.name)}</div><div class="grow"><h3>${m.name}</h3><p class="muted small">+${m.phone}, ID ${m.national_id}, ${r.plate}</p></div>${badge(m.status)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${doc("id_photo", "ID")}${doc("selfie", "Selfie")}${doc("bike_photo", "Bike")}</div>
      <p class="small muted">${r.pass_until && BL.date(r.pass_until) > new Date() ? "Pass until " + BL.clock(r.pass_until) : "No active pass"}, ${r.jobs_done} jobs, ${BL.stars(r.rating)}. Emergency contact: ${m.emergency_name || "none"} ${m.emergency_phone ? "+" + m.emergency_phone : ""}</p>
      <div class="field"><label for="xReason">Reason (shown to the rider if you reject)</label><input class="input" id="xReason" value="${m.reject_reason || ""}"></div>
      <div class="row wrap">${m.status !== "approved" ? BL.h`<button class="btn btn--green grow" data-s="approved">Approve</button>` : BL.h`<button class="btn btn--danger grow" data-s="suspended">Suspend</button>`}
        ${m.status === "pending" || m.status === "approved" ? BL.h`<button class="btn btn--soft grow" data-s="rejected">Reject</button>` : ""}</div>
      <div class="row"><input class="input grow" id="xAmt" inputmode="numeric" placeholder="Give free hours, e.g. 24"><button class="btn btn--dark" id="xAdj">Give</button></div></div>`, (s, close) => {
      BL.$$("[data-s]", s).forEach((b) => (b.onclick = () => BL.busy(b, async () => {
        const status = b.dataset.s, reason = BL.$("#xReason", s).value.trim();
        if (status === "rejected" && !reason) throw new Error("Tell the rider what to fix.");
        await BL.api.update("members", m.id, { status, reject_reason: status === "approved" ? "" : reason });
        BL.toast("Updated.", "ok"); close(); render();
      })));
      BL.$("#xAdj", s).onclick = (e) => BL.busy(e.currentTarget, async () => {
        const hours = parseInt(BL.$("#xAmt", s).value, 10);
        if (!(hours >= 1 && hours <= 168)) throw new Error("Enter 1 to 168 hours.");
        const res = await BL.api.post("/api/bl/admin/grant", { rider: r.id, hours, note: "Free time from BodaLink" });
        BL.toast("Pass runs until " + BL.clock(res.pass_until), "ok"); close(); render();
      });
    });
  }

  async function pass() {
    const list = await BL.api.list("members", { filter: 'role = "passenger"', sort: "-created", perPage: 60 });
    BL.html(body(), list.length ? BL.h`${list.map((m) => BL.h`<button class="item" data-pass="${m.id}" style="width:100%;text-align:left"><div class="avatar">${BL.initials(m.name)}</div>
      <div class="grow"><div class="t">${m.name}</div><div class="s">+${m.phone}${m.national_id ? ", ID " + m.national_id : ""}</div></div>
      ${m.id_verified ? BL.raw('<span class="badge badge--ok">ID verified</span>') : m.national_id ? BL.raw('<span class="badge badge--warn">ID to check</span>') : ""}${m.status === "suspended" ? badge("suspended") : ""}</button>`)}` : BL.h`<div class="empty">No passengers yet.</div>`);
  }
  async function passSheet(id) {
    const m = await BL.api.one("members", id);
    BL.sheet(BL.h`<div class="stack"><h3>${m.name}</h3><p class="muted small">+${m.phone}. National ID ${m.national_id || "not given"}. Emergency contact: ${m.emergency_name || "none"} ${m.emergency_phone ? "+" + m.emergency_phone : ""}</p>
      <button class="btn btn--green" data-v>${m.id_verified ? "Remove ID verified badge" : "Mark ID as verified"}</button>
      <button class="btn btn--danger" data-x>${m.status === "suspended" ? "Reinstate account" : "Suspend account"}</button></div>`, (s, close) => {
      BL.$("[data-v]", s).onclick = (e) => BL.busy(e.currentTarget, async () => { await BL.api.update("members", id, { id_verified: !m.id_verified }); close(); render(); });
      BL.$("[data-x]", s).onclick = (e) => BL.busy(e.currentTarget, async () => { await BL.api.update("members", id, { status: m.status === "suspended" ? "approved" : "suspended" }); close(); render(); });
    });
  }

  async function money() {
    const led = await BL.api.list("ledger", { sort: "-created", expand: "rider.member", perPage: 50 });
    const who = (r) => (r.expand && r.expand.rider && r.expand.rider.expand ? r.expand.rider.expand.member.name : "Rider");
    const names = { pass: "Day pass", free_pass: "Free first day", admin_pass: "Free time given" };
    const total = led.filter((l) => l.kind === "pass").reduce((a, l) => a + l.amount, 0);
    BL.html(body(), BL.h`<div class="card card--flat"><p class="muted small">Day pass income, last 50 entries</p><b class="money" style="font-size:30px">${BL.money(total)}</b></div>
      <h3 style="margin-top:22px">Day pass history</h3>${led.length ? led.map((l) => BL.h`<div class="item"><div class="grow"><div class="t">${who(l)}, ${names[l.kind] || l.kind}</div><div class="s">${l.note}, ${BL.ago(l.created)}, until ${BL.clock(l.valid_until)}</div></div>
      <b class="money">${l.amount ? BL.money(l.amount) : "Free"}</b></div>`) : BL.h`<div class="empty">No passes yet.</div>`}`);
  }

  async function rates() {
    const [places, cfg] = await Promise.all([BL.api.list("stages", { sort: "name" }), BL.api.list("settings")]);
    sec._settings = cfg;
    const price = (cfg.find((c) => c.key === "pass_price") || { value: 100 }).value;
    const free = (cfg.find((c) => c.key === "free_first_day") || { value: 1 }).value;
    BL.html(body(), BL.h`<h3>Day pass</h3><p class="hint">What a rider pays for 24 hours online. Riders set their own prices and keep all of their fares.</p>
      <div class="item"><div class="grow t">Price</div><button class="btn btn--soft btn--sm" data-set="pass_price" data-d="-10" aria-label="Lower pass price">-</button><b class="money" style="min-width:72px;text-align:center">${BL.money(price)}</b><button class="btn btn--soft btn--sm" data-set="pass_price" data-d="10" aria-label="Raise pass price">+</button></div>
      <div class="item"><div class="grow"><div class="t">Free first day for new riders</div><div class="s">Given when you approve a rider</div></div><button class="switch" role="switch" aria-checked="${!!free}" aria-label="Free first day" data-freeday data-on="${!!free}"></button></div>
      <h3 style="margin-top:24px">Place suggestions</h3><p class="hint">Popular places that appear as suggestions when a passenger types From or To. Passengers can still type any place.</p>
      ${places.map((s) => BL.h`<div class="item"><div class="grow t">${s.name}</div><button class="btn btn--danger btn--sm" data-delplace="${s.id}" aria-label="Remove ${s.name}">Remove</button></div>`)}
      <div class="row" style="margin-top:16px"><input class="input grow" id="nsName" placeholder="New place, e.g. Kimana Market"><button class="btn btn--dark" id="nsAdd">Add</button></div>`);
  }

  async function render() {
    BL.$$("#aTabs [data-t]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === tab));
    try { await { over, riders, pass, money, rates }[tab](); } catch (e) { BL.toast(e.message, "err"); }
  }

  BL.views.admin = {
    mount(s) {
      sec = s;
      s.addEventListener("click", async (e) => {
        const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; return render(); }
        const g = e.target.closest("[data-go]"); if (g) { tab = g.dataset.go; filter = "pending"; return render(); }
        const f = e.target.closest("[data-filter]"); if (f) { filter = f.dataset.filter; return render(); }
        const r = e.target.closest("[data-rider]"); if (r) return riderSheet(r.dataset.rider);
        const p = e.target.closest("[data-pass]"); if (p) return passSheet(p.dataset.pass);
        const set = e.target.closest("[data-set]");
        if (set) { const c = sec._settings.find((x) => x.key === set.dataset.set); await BL.api.update("settings", c.id, { value: Math.max(10, c.value + +set.dataset.d) }); await BL.api.loadConfig(); return render(); }
        const fd = e.target.closest("[data-freeday]");
        if (fd) { const c = sec._settings.find((x) => x.key === "free_first_day"); await BL.api.update("settings", c.id, { value: fd.dataset.on === "true" ? 0 : 1 }); return render(); }
        const del = e.target.closest("[data-delplace]");
        if (del) { await BL.api.req("DELETE", "/api/collections/stages/records/" + del.dataset.delplace); await BL.loadPlaces(); return render(); }
        if (e.target.closest("#nsAdd")) {
          const name = BL.$("#nsName", sec).value.trim();
          if (name.length < 2) return BL.toast("Enter a place name.", "err");
          try { await BL.api.create("stages", { name, base_fare: 0, active: true }); await BL.loadPlaces(); render(); } catch (er) { BL.toast(er.message, "err"); }
        }
      });
    },
    show() {
      render();
      unsub = BL.realtime.on("requests/*", () => { clearTimeout(pending); pending = setTimeout(() => tab === "over" && render(), 400); });
    },
    hide() { if (unsub) unsub(); },
  };
})();
