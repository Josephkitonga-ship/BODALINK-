/* Admin dashboard: review riders, watch dispatch, give pass time, set prices and places, edit the banner deck. */
(function () {
  const BL = (window.BL = window.BL || {});
  const LIMIT = 200;
  let sec, tab = "over", lastTab = "", filter = "pending", seq = 0, pending = null, unsubs = [];
  const search = { riders: "", pass: "" };
  const body = () => BL.$("#aBody", sec);
  const badge = (s) => BL.h`<span class="badge badge--${{ approved: "ok", pending: "warn", rejected: "err", suspended: "err" }[s] || ""}">${s}</span>`;

  // search: name, plate, email or phone (07.. and 254.. both work)
  const phoneHit = (phone, t) => { const d = t.replace(/\D/g, ""); if (!d) return false; return String(phone || "").includes(d.startsWith("0") ? "254" + d.slice(1) : d); };
  const matches = (t, parts, phone) => { t = t.trim(); if (!t) return true; const low = t.toLowerCase(); return parts.some((p) => String(p || "").toLowerCase().includes(low)) || phoneHit(phone, t); };
  const searchBox = (key, ph) => BL.h`<input class="input" type="search" data-search="${key}" placeholder="${ph}" aria-label="${ph}" value="${search[key]}" style="margin-bottom:10px">`;
  const more = (n) => (n >= LIMIT ? BL.h`<p class="hint" style="margin-top:10px">Showing the newest ${LIMIT}.</p>` : "");
  const goodLink = (l) => !l || /^(#|https?:\/\/|install$)/i.test(l);

  async function over(paint) {
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const LIVE = ["bidding", "assigned", "picked"], head = { count: "exact", head: true };
    const [online, pend, active, today] = await Promise.all([
      BL.api.count(BL.db("riders").select("id", head).eq("online", true)),
      BL.api.count(BL.db("profiles").select("id", head).eq("role", "rider").eq("status", "pending")),
      BL.api.count(BL.db("requests").select("id", head).in("status", LIVE)),
      BL.api.count(BL.db("requests").select("id", head).gte("created_at", dayStart)),
    ]);
    const paid = await BL.api.q(BL.db("ledger").select("amount").eq("kind", "pass").gte("created_at", dayStart).limit(200));
    const income = paid.reduce((a, l) => a + l.amount, 0);
    const live = await BL.api.q(BL.db("requests").select("*").in("status", LIVE).order("created_at", { ascending: false }).limit(20));
    const stat = (n, l) => BL.h`<div class="card card--flat grow"><b class="money" style="font-size:30px">${n}</b><p class="muted small">${l}</p></div>`;
    paint(BL.h`<div class="row wrap" style="gap:12px">${stat(online, "Riders online")}${stat(active, "Trips in progress")}${stat(today, "Requests today")}${stat(BL.money(income), "Pass income today")}
      <button class="card card--flat grow" data-go="riders" style="text-align:left"><b class="money" style="font-size:30px">${pend}</b><p class="muted small">Riders to review</p></button></div>
      <h3 style="margin:22px 0 4px">Dispatch monitor</h3>
      ${live.length ? live.map((r) => BL.h`<div class="item"><span class="badge ${r.kind === "parcel" ? "badge--parcel" : "badge--ok"}">${r.kind === "parcel" ? "Parcel" : "Ride"}</span>
        <div class="grow"><div class="t">${r.pickup} to ${r.dropoff}</div><div class="s">${r.passenger_name}${r.rider_name ? ", rider " + r.rider_name : ""}, ${BL.ago(r.created_at)}</div></div><span class="badge">${r.status}</span></div>`)
        : BL.h`<div class="empty">No trips right now.</div>`}`);
  }

  function fillRiders() {
    const box = BL.$("#aListR", sec); if (!box) return;
    const list = (sec._riders || []).filter((r) => matches(search.riders, [r.member.name, r.plate, r.member.email], r.member.phone));
    BL.html(box, list.length ? BL.h`${list.map((r) => { const m = r.member; return BL.h`<button class="item" data-rider="${r.id}" style="width:100%;text-align:left">
        ${BL.avatar(m.name, m.photo)}<div class="grow"><div class="t">${m.name} ${r.online ? BL.raw('<span style="color:var(--forest)">●</span>') : ""}</div><div class="s">${r.plate}, +${m.phone}</div></div>
        <div style="text-align:right">${badge(m.status)}<div class="s">${r.pass_until && BL.date(r.pass_until) > new Date() ? "Pass on" : "No pass"}</div></div></button>`; })}`
      : BL.h`<div class="empty">${search.riders ? "No rider matches that." : "Nobody here."}</div>`);
  }
  async function riders(paint) {
    let rq = BL.db("riders").select("*, member:profiles!member_id!inner(*)").order("created_at", { ascending: false }).limit(LIMIT);
    if (filter === "pending" || filter === "approved") rq = rq.eq("member.status", filter);
    else if (filter === "other") rq = rq.in("member.status", ["rejected", "suspended"]);
    const list = await BL.api.q(rq);
    sec._riders = list;
    paint(BL.h`<div class="chips" style="margin-bottom:10px">${["pending", "approved", "other", "all"].map((k) => BL.h`<button class="chip" data-filter="${k}" aria-pressed="${k === filter}">${k[0].toUpperCase() + k.slice(1)}</button>`)}</div>
      ${searchBox("riders", "Search name, phone, plate or email")}<div id="aListR"></div>${more(list.length)}`);
    fillRiders();
  }

  async function riderSheet(id) {
    const r = await BL.api.q(BL.db("riders").select("*, member:profiles!member_id(*)").eq("id", id).single()), m = r.member;
    const urls = {}; for (const k of ["id_photo", "bike_photo"]) urls[k] = r[k] ? await BL.api.docUrl(r[k]) : ""; urls.profile = m.photo ? await BL.api.photoUrl(m.photo) : "";
    const doc = (f, l) => ((f === "profile" ? m.photo : r[f]) ? BL.h`<a href="${urls[f]}" target="_blank" rel="noopener"><img src="${urls[f]}" alt="${l}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px"><span class="small muted">${l}</span></a>` : BL.h`<div class="card card--flat empty small">${l} missing</div>`);
    BL.sheet(BL.h`<div class="stack"><div class="row">${BL.avatar(m.name, m.photo)}<div class="grow"><h3>${m.name}</h3><p class="muted small">${m.email ? m.email + ", " : ""}+${m.phone}, ${m.national_id ? "ID " + m.national_id : "ID not given"}, ${r.plate}</p></div>${badge(m.status)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${doc("profile", "Profile")}${doc("id_photo", "ID")}${doc("bike_photo", "Bike")}</div>
      ${m.photo ? "" : BL.h`<p class="small" style="color:var(--red)">No profile photo yet. You can approve this rider once they add one.</p>`}
      <p class="small muted">${r.pass_until && BL.date(r.pass_until) > new Date() ? "Pass until " + BL.clock(r.pass_until) : "No active pass"}, ${r.jobs_done} jobs, ${BL.stars(r.rating)}. Emergency contact: ${m.emergency_name || "none"} ${m.emergency_phone ? "+" + m.emergency_phone : ""}</p>
      <div class="row between"><div><b>Helmet badge</b><div class="small muted">${r.helmet ? "Rider says they give passengers a helmet" : "Rider has not said they give a helmet"}</div></div><button class="switch" id="xHel" role="switch" aria-checked="${!!r.helmet_verified}" aria-label="Helmet verified"></button></div>
      <div class="field"><label for="xReason">Reason (shown to the rider if you reject or suspend)</label><input class="input" id="xReason" value="${m.reject_reason || ""}"></div>
      <div class="row wrap">${m.status !== "approved" ? BL.h`<button class="btn btn--green grow" data-s="approved" ${m.photo ? "" : BL.raw("disabled")}>Approve</button>` : BL.h`<button class="btn btn--danger grow" data-s="suspended">Suspend</button>`}
        ${m.status === "pending" || m.status === "approved" ? BL.h`<button class="btn btn--soft grow" data-s="rejected">Reject</button>` : ""}</div>
      <div class="row"><input class="input grow" id="xAmt" inputmode="numeric" placeholder="Give free hours, e.g. 24"><button class="btn btn--dark" id="xAdj">Give</button></div>
      <button class="btn btn--soft btn--block" id="xPay">Record M-Pesa payment</button></div>`, (s, close) => {
      BL.$("#xHel", s).onclick = async (e) => { try { await BL.api.rpc("admin_set_helmet_verified", { p_rider: r.id, p_verified: !r.helmet_verified }); r.helmet_verified = !r.helmet_verified; e.currentTarget.setAttribute("aria-checked", r.helmet_verified); } catch (er) { BL.toast(er.message, "err"); } };
      BL.$$("[data-s]", s).forEach((b) => (b.onclick = async () => {
        const status = b.dataset.s, reason = BL.$("#xReason", s).value.trim();
        if (status === "rejected" && !reason) return BL.toast("Tell the rider what to fix.", "err");
        if (status === "suspended" && !(await BL.confirm("Suspend this rider?", "They go offline and cannot take jobs until you approve them again.", "Suspend"))) return;
        BL.busy(b, async () => {
          await BL.api.rpc("admin_set_member_status", { p_member: m.id, p_status: status, p_reason: reason || null });
          BL.toast("Updated.", "ok"); close(); render();
        });
      }));
      BL.$("#xAdj", s).onclick = (e) => BL.busy(e.currentTarget, async () => {
        const hours = parseInt(BL.$("#xAmt", s).value, 10);
        if (!(hours >= 1 && hours <= 168)) throw new Error("Enter 1 to 168 hours.");
        const until = await BL.api.rpc("admin_grant_hours", { p_rider: r.id, p_hours: hours, p_note: "Free time from BodaLink" });
        BL.toast("Pass runs until " + BL.clock(until), "ok"); close(); render();
      });
      BL.$("#xPay", s).onclick = (e) => BL.busy(e.currentTarget, async () => {
        const until = await BL.api.rpc("admin_record_pass_payment", { p_rider: r.id, p_note: "M-Pesa" });
        BL.toast("Pass runs until " + BL.clock(until), "ok"); close(); render();
      });
    });
  }

  function fillPass() {
    const box = BL.$("#aListP", sec); if (!box) return;
    const list = (sec._pass || []).filter((m) => matches(search.pass, [m.name, m.email, m.national_id], m.phone));
    BL.html(box, list.length ? BL.h`${list.map((m) => BL.h`<button class="item" data-pass="${m.id}" style="width:100%;text-align:left">${BL.avatar(m.name, m.photo)}
      <div class="grow"><div class="t">${m.name}</div><div class="s">+${m.phone}${m.national_id ? ", ID " + m.national_id : ""}</div></div>
      ${m.id_verified ? BL.raw('<span class="badge badge--ok">ID verified</span>') : m.national_id ? BL.raw('<span class="badge badge--warn">ID to check</span>') : ""}${m.status === "suspended" ? badge("suspended") : ""}</button>`)}`
      : BL.h`<div class="empty">${search.pass ? "No passenger matches that." : "No passengers yet."}</div>`);
  }
  async function pass(paint) {
    const list = await BL.api.q(BL.db("profiles").select("*").eq("role", "passenger").order("created_at", { ascending: false }).limit(LIMIT));
    sec._pass = list;
    paint(BL.h`${searchBox("pass", "Search name, phone, email or ID number")}<div id="aListP"></div>${more(list.length)}`);
    fillPass();
  }
  async function passSheet(id) {
    const m = await BL.api.q(BL.db("profiles").select("*").eq("id", id).single());
    BL.sheet(BL.h`<div class="stack"><h3>${m.name}</h3><p class="muted small">${m.email ? m.email + ". " : ""}+${m.phone}. National ID ${m.national_id || "not given"}. Emergency contact: ${m.emergency_name || "none"} ${m.emergency_phone ? "+" + m.emergency_phone : ""}</p>
      <button class="btn btn--green" data-v>${m.id_verified ? "Remove ID verified badge" : "Mark ID as verified"}</button>
      <button class="btn btn--danger" data-x>${m.status === "suspended" ? "Reinstate account" : "Suspend account"}</button></div>`, (s, close) => {
      BL.$("[data-v]", s).onclick = (e) => BL.busy(e.currentTarget, async () => { await BL.api.rpc("admin_set_id_verified", { p_member: id, p_verified: !m.id_verified }); close(); render(); });
      BL.$("[data-x]", s).onclick = async (e) => {
        const btn = e.currentTarget, suspend = m.status !== "suspended";
        if (suspend && !(await BL.confirm("Suspend this account?", "They will not be able to book until you reinstate them.", "Suspend"))) return;
        BL.busy(btn, async () => { await BL.api.rpc("admin_set_member_status", { p_member: id, p_status: suspend ? "suspended" : "approved", p_reason: null }); close(); render(); });
      };
    });
  }

  async function money(paint) {
    const led = await BL.api.q(BL.db("ledger").select("*, rider:riders(member:profiles!member_id(name))").order("created_at", { ascending: false }).limit(50));
    const who = (r) => (r.rider && r.rider.member ? r.rider.member.name : "Rider");
    const names = { pass: "Day pass", free_pass: "Free first day", admin_pass: "Free time given" };
    const total = led.filter((l) => l.kind === "pass").reduce((a, l) => a + l.amount, 0);
    paint(BL.h`<div class="card card--flat"><p class="muted small">Day pass income, last 50 entries</p><b class="money" style="font-size:30px">${BL.money(total)}</b></div>
      <h3 style="margin-top:22px">Day pass history</h3>${led.length ? led.map((l) => BL.h`<div class="item"><div class="grow"><div class="t">${who(l)}, ${names[l.kind] || l.kind}</div><div class="s">${l.note ? l.note + ", " : ""}${BL.ago(l.created_at)}${l.valid_until ? ", until " + BL.clock(l.valid_until) : ""}</div></div>
      <b class="money">${l.amount ? BL.money(l.amount) : "Free"}</b></div>`) : BL.h`<div class="empty">No passes yet.</div>`}`);
  }

  async function rates(paint) {
    const [places, cfg] = await Promise.all([BL.api.q(BL.db("zones").select("*").order("name")), BL.api.q(BL.db("settings").select("*"))]);
    sec._settings = cfg;
    const num = (k) => (cfg.find((c) => c.key === k) || { value: 0 }).value;
    const price = (cfg.find((c) => c.key === "pass_price") || { value: 100 }).value;
    const free = (cfg.find((c) => c.key === "free_first_day") || { value: 1 }).value;
    paint(BL.h`<div class="cols2"><div><h3>Day pass</h3><p class="hint">What a rider pays for 24 hours online. Riders set their own prices and keep all of their fares.</p>
      <div class="item"><div class="grow t">Price</div><button class="btn btn--soft btn--sm" data-set="pass_price" data-d="-10" aria-label="Lower pass price">-</button><b class="money" style="min-width:72px;text-align:center">${BL.money(price)}</b><button class="btn btn--soft btn--sm" data-set="pass_price" data-d="10" aria-label="Raise pass price">+</button></div>
      <div class="item"><div class="grow"><div class="t">Free first day for new riders</div><div class="s">Given when you approve a rider</div></div><button class="switch" role="switch" aria-checked="${!!free}" aria-label="Free first day" data-freeday data-on="${!!free}"></button></div>
      <h3 style="margin-top:24px">Fare estimates</h3><p class="hint">Off by default because riders set their own prices. When on, passengers see "Typical fare" worked out as base rate, plus the zone add-on, plus a parcel size surcharge.</p>
      <div class="item"><div class="grow t">Show fare estimates</div><button class="switch" role="switch" aria-checked="${!!num("fare_estimates")}" aria-label="Show fare estimates" data-fest data-on="${!!num("fare_estimates")}"></button></div>
      ${[["fare_base", "Base rate"], ["fare_medium", "Medium parcel surcharge"], ["fare_large", "Large parcel surcharge"]].map(([k, l]) => BL.h`<div class="item"><div class="grow t">${l}</div><button class="btn btn--soft btn--sm" data-set="${k}" data-d="-10" aria-label="Lower ${l}">-</button><b class="money" style="min-width:72px;text-align:center">${BL.money(num(k))}</b><button class="btn btn--soft btn--sm" data-set="${k}" data-d="10" aria-label="Raise ${l}">+</button></div>`)}
      </div><div>
      <h3 class="cols2__h">Place suggestions and zones</h3><p class="hint">Popular places appear as suggestions when a passenger types From or To. A place's zone add-on is added to the estimate when a trip ends there.</p>
      ${places.map((s) => BL.h`<div class="item"><div class="grow"><div class="t">${s.name}</div><div class="s">Zone add-on ${BL.money(s.base_fare || 0)}</div></div><button class="btn btn--soft btn--sm" data-zone="${s.id}" data-d="-10" data-v="${s.base_fare || 0}" aria-label="Lower ${s.name} add-on">-</button><button class="btn btn--soft btn--sm" data-zone="${s.id}" data-d="10" data-v="${s.base_fare || 0}" aria-label="Raise ${s.name} add-on">+</button><button class="btn btn--danger btn--sm" data-delplace="${s.id}" data-name="${s.name}" aria-label="Remove ${s.name}">Remove</button></div>`)}
      <div class="row" style="margin-top:16px"><input class="input grow" id="nsName" placeholder="New place, e.g. Kimana Market"><button class="btn btn--dark" id="nsAdd">Add</button></div></div></div>`);
  }

  async function ads(paint) {
    const list = await BL.api.q(BL.db("adverts").select("*").order("sort").order("created_at", { ascending: false }).limit(50));
    sec._ads = list;
    paint(BL.h`<div class="row between"><div><h3>Advert deck</h3><p class="hint">The rotating banners on the home page. Active adverts show in order.</p></div><button class="btn btn--green btn--sm" data-adnew>Add advert</button></div>
      ${list.length ? list.map((a) => BL.h`<div class="item"><span class="swatch swatch--${a.theme || "forest"}">${a.image ? BL.h`<img src="${BL.api.advertUrl(a.image)}" alt="">` : ""}</span>
        <button class="grow" data-adedit="${a.id}" style="text-align:left"><div class="t">${a.title}</div><div class="s">${a.cta_text ? "Button: " + a.cta_text : "No button"}, order ${a.sort || 0}</div></button>
        <button class="switch" role="switch" aria-checked="${a.active}" aria-label="${a.title} active" data-adon="${a.id}" data-on="${a.active}"></button></div>`)
        : BL.h`<div class="empty">No adverts yet. The home page shows the built-in banners until you add one.</div>`}`);
  }

  function adSheet(ad) {
    const f = ad || { theme: "forest", sort: (sec._ads || []).length + 1, active: true };
    BL.sheet(BL.h`<form class="stack" id="adForm" novalidate><h3>${ad ? "Edit advert" : "New advert"}</h3>
      <div class="field"><label for="adT">Headline</label><input class="input" id="adT" maxlength="80" value="${f.title || ""}"></div>
      <div class="field"><label for="adS">Short text</label><input class="input" id="adS" maxlength="200" value="${f.subtitle || ""}"></div>
      <div class="field"><label for="adC">Button text (optional)</label><input class="input" id="adC" maxlength="30" value="${f.cta_text || ""}"></div>
      <div class="field"><label for="adL">Button link</label><input class="input" id="adL" value="${f.cta_link || ""}" placeholder="#/auth?mode=register&role=rider">
        <span class="hint">Use a page like #/auth?mode=register&role=rider, the word install for the install button, or a full https:// link.</span></div>
      <div class="field"><label for="adTh">Colour</label><select class="select" id="adTh">${["forest", "ink", "amber"].map((t) => BL.h`<option value="${t}" ${t === f.theme ? BL.raw("selected") : ""}>${t[0].toUpperCase() + t.slice(1)}</option>`)}</select></div>
      <div class="field"><label for="adO">Order (1 shows first)</label><input class="input" id="adO" inputmode="numeric" value="${f.sort || 1}"></div>
      <div class="field"><span class="label">Picture (optional). Wide works best, about 1200 by 650. To show a finished banner picture on its own, leave the short text and button empty</span><label class="file" id="adFile"><input type="file" accept="image/*"><span>${f.image ? "Picture saved. Tap to replace" : "Tap to choose a picture"}</span></label></div>
      <div class="row between"><span>Show on the home page</span><button type="button" class="switch" id="adOn" role="switch" aria-checked="${!!f.active}"></button></div>
      <button class="btn btn--green btn--lg btn--block" type="submit">Save advert</button>
      ${ad ? BL.h`<button class="btn btn--danger btn--block" type="button" id="adDel">Delete advert</button>` : ""}</form>`, (s, close) => {
      let on = !!f.active, file = null;
      BL.$("#adOn", s).onclick = (e) => { on = !on; e.currentTarget.setAttribute("aria-checked", on); };
      BL.$("#adFile input", s).onchange = (e) => { file = e.target.files[0] || null; if (file) BL.$("#adFile span", s).textContent = file.name; };
      BL.$("#adForm", s).onsubmit = (e) => {
        e.preventDefault();
        const t = BL.$("#adT", s).value.trim(), link = BL.$("#adL", s).value.trim();
        if (t.length < 2) return BL.toast("Enter a headline.", "err");
        if (!goodLink(link)) return BL.toast("The link must start with #, https:// or be the word install.", "err");
        BL.busy(e.submitter, async () => {
          const row = { title: t, subtitle: BL.$("#adS", s).value.trim() || null, cta_text: BL.$("#adC", s).value.trim() || null, cta_link: link || null,
            theme: BL.$("#adTh", s).value, sort: parseInt(BL.$("#adO", s).value, 10) || 1, active: on };
          if (file) row.image = await BL.api.uploadAdvert(await BL.shrink(file, 1000));
          await BL.api.q(ad ? BL.db("adverts").update(row).eq("id", ad.id) : BL.db("adverts").insert(row));
          BL.toast("Advert saved.", "ok"); close(); render();
        });
      };
      if (ad) BL.$("#adDel", s).onclick = async (e) => {
        if (!(await BL.confirm("Delete this advert?", "It disappears from the home page.", "Delete"))) return;
        BL.busy(e.currentTarget, async () => { await BL.api.q(BL.db("adverts").delete().eq("id", ad.id)); close(); render(); });
      };
    });
  }

  async function render() {
    const my = ++seq;   // a slow tab must never overwrite the tab you moved to
    BL.$$("#aTabs [data-t]", sec).forEach((b) => {
      const on = b.dataset.t === tab; b.setAttribute("aria-pressed", on);
      if (on && tab !== lastTab && b.scrollIntoView) b.scrollIntoView({ inline: "center", block: "nearest" });
    });
    if (tab !== lastTab) BL.html(body(), BL.h`<p class="muted" style="padding:28px 0;text-align:center">Loading...</p>`);
    lastTab = tab;
    try { await { over, riders, pass, money, ads, rates }[tab]((html) => { if (my === seq) BL.html(body(), html); }); }
    catch (e) { if (my === seq) { BL.html(body(), BL.h`<div class="empty">Could not load this tab.<br><button class="btn btn--soft btn--sm" data-retry style="margin-top:10px">Try again</button></div>`); BL.toast(e.message, "err"); } }
  }

  // one place for taps that change data: ignore double taps, and show any error instead of failing silently
  async function act(el, work) {
    if (el.disabled) return;
    el.disabled = true;
    try { await work(); } catch (er) { el.disabled = false; BL.toast(er.message, "err"); }
  }

  BL.views.admin = {
    mount(s) {
      sec = s;
      s.addEventListener("input", (e) => {
        const k = e.target.dataset && e.target.dataset.search; if (!k) return;
        search[k] = e.target.value; k === "riders" ? fillRiders() : fillPass();
      });
      s.addEventListener("click", (e) => {
        const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; return render(); }
        if (e.target.closest("[data-retry]")) return render();
        const g = e.target.closest("[data-go]"); if (g) { tab = g.dataset.go; filter = "pending"; return render(); }
        const f = e.target.closest("[data-filter]"); if (f) { filter = f.dataset.filter; return render(); }
        const r = e.target.closest("[data-rider]"); if (r) return riderSheet(r.dataset.rider).catch((er) => BL.toast(er.message, "err"));
        const p = e.target.closest("[data-pass]"); if (p) return passSheet(p.dataset.pass).catch((er) => BL.toast(er.message, "err"));
        const set = e.target.closest("[data-set]");
        if (set) return act(set, async () => {
          const c = sec._settings.find((x) => x.key === set.dataset.set), min = c.key === "pass_price" ? 10 : 0;
          await BL.api.rpc("admin_update_setting", { p_key: c.key, p_value: Math.max(min, Number(c.value) + +set.dataset.d) });
          await BL.api.loadConfig(); await render();
        });
        const zn = e.target.closest("[data-zone]");
        if (zn) return act(zn, async () => { await BL.api.q(BL.db("zones").update({ base_fare: Math.max(0, +zn.dataset.v + +zn.dataset.d) }).eq("id", zn.dataset.zone)); await BL.loadPlaces(); await render(); });
        const fe = e.target.closest("[data-fest]");
        if (fe) return act(fe, async () => { await BL.api.rpc("admin_update_setting", { p_key: "fare_estimates", p_value: fe.dataset.on === "true" ? 0 : 1 }); await BL.api.loadConfig(); await render(); });
        const fd = e.target.closest("[data-freeday]");
        if (fd) return act(fd, async () => { await BL.api.rpc("admin_update_setting", { p_key: "free_first_day", p_value: fd.dataset.on === "true" ? 0 : 1 }); await BL.api.loadConfig(); await render(); });
        if (e.target.closest("[data-adnew]")) return adSheet(null);
        const ae = e.target.closest("[data-adedit]"); if (ae) return adSheet(sec._ads.find((x) => x.id === ae.dataset.adedit));
        const ao = e.target.closest("[data-adon]");
        if (ao) return act(ao, async () => { await BL.api.q(BL.db("adverts").update({ active: ao.dataset.on !== "true" }).eq("id", ao.dataset.adon)); await render(); });
        const del = e.target.closest("[data-delplace]");
        if (del) return act(del, async () => {
          if (!(await BL.confirm("Remove " + del.dataset.name + "?", "It stops appearing as a place suggestion. Past trips are not affected.", "Remove"))) { del.disabled = false; return; }
          await BL.api.q(BL.db("zones").delete().eq("id", del.dataset.delplace)); await BL.loadPlaces(); await render();
        });
        const add = e.target.closest("#nsAdd");
        if (add) return act(add, async () => {
          const name = BL.$("#nsName", sec).value.trim();
          if (name.length < 2) { add.disabled = false; return BL.toast("Enter a place name.", "err"); }
          await BL.api.q(BL.db("zones").insert({ name, base_fare: 0, active: true })); await BL.loadPlaces(); await render();
        });
      });
    },
    show() {
      render();
      const refresh = () => { clearTimeout(pending); pending = setTimeout(() => (tab === "over" || (tab === "riders" && !search.riders)) && render(), 500); };
      unsubs = [BL.realtime.on("requests/*", refresh), BL.realtime.on("riders/*", refresh)];
    },
    hide() { unsubs.forEach((u) => u()); unsubs = []; clearTimeout(pending); },
  };
})();
