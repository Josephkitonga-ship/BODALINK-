/* Admin: approve riders, watch dispatch, move float, set fares. */
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
    const live = await BL.api.list("requests", { filter: 'status = "bidding" || status = "open" || status = "assigned" || status = "picked"', sort: "-created", perPage: 20 });
    const stat = (n, l, go) => BL.h`<${BL.raw(go ? "a" : "div")} class="card card--flat grow" ${BL.raw(go ? 'href="' + go + '"' : "")} style="text-decoration:none"><b class="money" style="font-size:30px">${n}</b><p class="muted small">${l}</p></${BL.raw(go ? "a" : "div")}>`;
    BL.html(body(), BL.h`<div class="row wrap" style="gap:12px">${stat(online, "Riders online")}${stat(active, "Trips in progress")}${stat(today, "Requests today")}
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
        <div class="avatar">${BL.initials(m.name)}</div><div class="grow"><div class="t">${m.name} ${r.online ? BL.raw('<span style="color:var(--green)">●</span>') : ""}</div><div class="s">${r.plate}, +${m.phone}, ${BL.stageName(r.home_stage)}</div></div>
        <div style="text-align:right">${badge(m.status)}<div class="s money">${BL.money(r.float)}</div></div></button>`; }) : BL.h`<div class="empty">Nobody here.</div>`}`);
  }

  async function riderSheet(id) {
    const r = await BL.api.one("riders", id, { expand: "member" }), m = r.expand.member;
    const tok = await BL.api.fileToken().catch(() => "");
    const doc = (f, l) => (r[f] ? BL.h`<a href="${BL.api.fileUrl(r, f, tok)}" target="_blank" rel="noopener"><img src="${BL.api.fileUrl(r, f, tok)}" alt="${l}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px"><span class="small muted">${l}</span></a>` : BL.h`<div class="card card--flat empty small">${l} missing</div>`);
    BL.sheet(BL.h`<div class="stack"><div class="row"><div class="avatar">${BL.initials(m.name)}</div><div class="grow"><h3>${m.name}</h3><p class="muted small">+${m.phone}, ID ${m.national_id}, ${r.plate}</p></div>${badge(m.status)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${doc("id_photo", "ID")}${doc("selfie", "Selfie")}${doc("bike_photo", "Bike")}</div>
      <p class="small muted">Float ${BL.money(r.float)}, ${r.jobs_done} jobs, ${BL.stars(r.rating)}. Emergency contact: ${m.emergency_name || "none"} ${m.emergency_phone ? "+" + m.emergency_phone : ""}</p>
      <div class="field"><label for="xReason">Reason (shown to the rider if you reject)</label><input class="input" id="xReason" value="${m.reject_reason || ""}"></div>
      <div class="row wrap">${m.status !== "approved" ? BL.h`<button class="btn btn--green grow" data-s="approved">Approve</button>` : BL.h`<button class="btn btn--danger grow" data-s="suspended">Suspend</button>`}
        ${m.status === "pending" || m.status === "approved" ? BL.h`<button class="btn btn--soft grow" data-s="rejected">Reject</button>` : ""}</div>
      <div class="row"><input class="input grow" id="xAmt" inputmode="numeric" placeholder="Float adjustment, e.g. 200 or -50"><button class="btn btn--dark" id="xAdj">Apply</button></div></div>`, (s, close) => {
      BL.$$("[data-s]", s).forEach((b) => (b.onclick = () => BL.busy(b, async () => {
        const status = b.dataset.s, reason = BL.$("#xReason", s).value.trim();
        if (status === "rejected" && !reason) throw new Error("Tell the rider what to fix.");
        await BL.api.update("members", m.id, { status, reject_reason: status === "approved" ? "" : reason });
        BL.toast("Updated.", "ok"); close(); render();
      })));
      BL.$("#xAdj", s).onclick = (e) => BL.busy(e.currentTarget, async () => {
        const amount = parseInt(BL.$("#xAmt", s).value, 10);
        if (!amount) throw new Error("Enter an amount.");
        const res = await BL.api.post("/api/bl/admin/adjust", { rider: r.id, amount, note: "Admin adjustment" });
        BL.toast("Float is now " + BL.money(res.float), "ok"); close(); render();
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
    const [led, low] = await Promise.all([BL.api.list("ledger", { sort: "-created", expand: "rider.member", perPage: 40 }), BL.api.list("riders", { filter: "float < " + BL.cfg.min_float, expand: "member", perPage: 30 })]);
    const who = (r) => (r.expand && r.expand.rider && r.expand.rider.expand ? r.expand.rider.expand.member.name : "Rider");
    BL.html(body(), BL.h`<h3>Riders under the KSh ${BL.cfg.min_float} floor</h3>${low.length ? low.map((r) => BL.h`<div class="item"><div class="grow"><div class="t">${r.expand.member.name}</div><div class="s">${r.plate}, +${r.expand.member.phone}</div></div><b class="money">${BL.money(r.float)}</b></div>`) : BL.h`<div class="empty">Everyone is above the floor.</div>`}
      <h3 style="margin-top:24px">Float ledger</h3>${led.map((l) => BL.h`<div class="item"><div class="grow"><div class="t">${who(l)}, ${l.kind.replace("_", " ")}</div><div class="s">${l.note}, ${BL.ago(l.created)}</div></div>
      <div style="text-align:right"><b class="money" style="color:var(--${l.amount < 0 ? "red" : "green-600"})">${l.amount > 0 ? "+" : ""}${BL.money(l.amount)}</b><div class="s">${BL.money(l.balance_after)}</div></div></div>`)}`);
  }

  async function rates() {
    const [st, rules] = await Promise.all([BL.api.list("stages", { sort: "name" }), BL.api.list("rate_rules", { sort: "name" })]);
    BL.html(body(), BL.h`<h3>Conditions</h3><p class="hint">Switch on to raise every suggested fare. Riders still choose their own price.</p>
      ${rules.map((r) => BL.h`<div class="item"><div class="grow t">${r.name} +${r.percent}%</div><button class="switch" role="switch" aria-checked="${r.active}" aria-label="${r.name}" data-rule="${r.id}" data-on="${r.active}"></button></div>`)}
      <h3 style="margin-top:24px">Stages and base fares</h3>
      ${st.map((s) => BL.h`<div class="item"><div class="grow"><div class="t">${s.name}</div><div class="s">Suggested now ${BL.money(Math.round((s.base_fare * (1 + rules.filter((r) => r.active).reduce((a, r) => a + r.percent, 0) / 100)) / 10) * 10)}</div></div>
        <button class="btn btn--soft btn--sm" data-fare="${s.id}" data-d="-10" aria-label="Lower ${s.name} fare">-</button><b class="money" style="min-width:64px;text-align:center">${BL.money(s.base_fare)}</b>
        <button class="btn btn--soft btn--sm" data-fare="${s.id}" data-d="10" data-base="${s.base_fare}" aria-label="Raise ${s.name} fare">+</button>
        <button class="switch" role="switch" aria-checked="${s.active}" aria-label="${s.name} active" data-stage="${s.id}" data-on="${s.active}"></button></div>`)}
      <div class="row" style="margin-top:16px"><input class="input grow" id="nsName" placeholder="New stage name"><input class="input" id="nsFare" inputmode="numeric" placeholder="Fare" style="width:90px"><button class="btn btn--dark" id="nsAdd">Add</button></div>`);
    sec._stages = st;
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
        const rule = e.target.closest("[data-rule]"); if (rule) { await BL.api.update("rate_rules", rule.dataset.rule, { active: rule.dataset.on !== "true" }); await BL.loadStages(); return render(); }
        const sg = e.target.closest("[data-stage]"); if (sg) { await BL.api.update("stages", sg.dataset.stage, { active: sg.dataset.on !== "true" }); await BL.loadStages(); return render(); }
        const fare = e.target.closest("[data-fare]");
        if (fare) { const cur = sec._stages.find((x) => x.id === fare.dataset.fare); await BL.api.update("stages", cur.id, { base_fare: Math.max(50, cur.base_fare + +fare.dataset.d) }); await BL.loadStages(); return render(); }
        if (e.target.closest("#nsAdd")) {
          const name = BL.$("#nsName", sec).value.trim(), fr = parseInt(BL.$("#nsFare", sec).value, 10);
          if (name.length < 2 || !fr) return BL.toast("Enter a name and a fare.", "err");
          try { await BL.api.create("stages", { name, base_fare: fr, active: true }); await BL.loadStages(); render(); } catch (er) { BL.toast(er.message, "err"); }
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
