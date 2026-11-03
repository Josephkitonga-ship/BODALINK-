/* Small UI helpers: safe templates, toasts, sheets, formatting. */
(function () {
  const BL = (window.BL = window.BL || {});
  BL.$ = (s, r) => (r || document).querySelector(s);
  BL.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  BL.esc = esc;
  BL.raw = (html) => ({ __raw: true, html });
  const part = (v) => (v && v.__raw ? v.html : Array.isArray(v) ? v.map(part).join("") : esc(v));
  // h`<b>${userText}</b>` escapes every value unless it was wrapped in BL.raw()
  BL.h = (strings, ...vals) => BL.raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ""), ""));
  BL.html = (el, tpl) => { el.innerHTML = tpl && tpl.__raw ? tpl.html : esc(tpl); return el; };

  BL.money = (n) => {
    n = Number(n) || 0;
    return "KSh " + n.toLocaleString("en-KE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  };
  BL.initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  BL.date = (s) => (s ? new Date(String(s).replace(" ", "T")) : null);
  BL.ago = (s) => {
    const d = BL.date(s); if (!d) return "";
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    if (m < 1440) return Math.round(m / 60) + " h ago";
    return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
  };
  BL.clock = (s) => { const d = BL.date(s); return d ? d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : ""; };
  BL.stars = (r) => (r ? "★ " + Number(r).toFixed(1) : "New rider");
  BL.tel = (phone) => "tel:+" + String(phone).replace(/\D/g, "");
  // WhatsApp link builder. Confirmations go to WhatsApp, dispatch stays in the app.
  BL.waLink = (phone, text) => "https://wa.me/" + (phone ? String(phone).replace(/\D/g, "") : "") + "?text=" + encodeURIComponent(text);

  BL.toast = (msg, kind) => {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " toast--" + kind : "");
    t.setAttribute("role", kind === "err" ? "alert" : "status");
    t.textContent = msg;
    BL.$("#toasts").appendChild(t);
    setTimeout(() => t.remove(), kind === "err" ? 5200 : 3400);
  };

  BL.sheet = (tpl, onMount) => {
    const root = BL.$("#sheet-root");
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    BL.html(sheet, tpl);
    const prev = document.activeElement;
    const close = () => { scrim.remove(); sheet.remove(); document.removeEventListener("keydown", key); if (prev && prev.focus) prev.focus(); };
    const key = (e) => e.key === "Escape" && close();
    scrim.onclick = close;
    document.addEventListener("keydown", key);
    root.append(scrim, sheet);
    BL.$$("[data-close]", sheet).forEach((b) => (b.onclick = close));
    const first = BL.$("button,input,select", sheet); if (first) first.focus();
    if (onMount) onMount(sheet, close);
    return close;
  };

  BL.confirm = (title, body, okText) => new Promise((resolve) => {
    let done = false;
    const close = BL.sheet(BL.h`<h3>${title}</h3><p class="muted" style="margin:6px 0 18px">${body}</p>
      <div class="stack"><button class="btn btn--dark btn--block" data-ok>${okText || "Yes"}</button>
      <button class="btn btn--soft btn--block" data-close>Not now</button></div>`,
      (s, c) => { BL.$("[data-ok]", s).onclick = () => { done = true; c(); resolve(true); }; });
    const scrim = BL.$$(".scrim").pop();
    new MutationObserver(() => { if (!document.body.contains(scrim) && !done) { done = true; resolve(false); } }).observe(BL.$("#sheet-root"), { childList: true });
  });

  // Disable a button and show a spinner while a promise runs. Shows the error as a toast.
  BL.busy = async (btn, work) => {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try { return await work(); }
    catch (e) { BL.toast(e.message, "err"); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  };

  let audio;
  BL.beep = () => {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.connect(g); g.connect(audio.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
      o.start(); o.stop(audio.currentTime + 0.35);
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  };

  BL.stages = []; // filled at start
  BL.stageName = (id) => { const s = BL.stages.find((x) => x.id === id); return s ? s.name : ""; };
  BL.loadStages = async () => {
    try { BL.stages = (await BL.api.list("stages", { filter: "active = true", sort: "name" })) || []; BL.rules = await BL.api.list("rate_rules", { filter: "active = true" }); }
    catch (_) { BL.stages = BL.stages || []; BL.rules = []; }
  };
  // Same maths as the server: base fare plus every active rule, rounded to KSh 10
  BL.SIZES = [["small", "Small", "up to 3 kg"], ["medium", "Medium", "up to 8 kg"], ["large", "Large", "over 8 kg"]];
  const MULT = { small: 1, medium: 1.2, large: 1.5 };
  BL.fareFor = (stageId, size) => {
    const s = BL.stages.find((x) => x.id === stageId);
    if (!s) return 150;
    const pct = (BL.rules || []).reduce((a, r) => a + (r.percent || 0), 0);
    return Math.round((s.base_fare * (1 + pct / 100) * (MULT[size] || 1)) / 10) * 10;
  };
  BL.sizeChips = (box, selected) => {
    BL.html(box, BL.h`${BL.SIZES.map(([k, n, d]) => BL.h`<button type="button" class="chip" data-w="${k}" aria-pressed="${k === selected}">${n}, ${d}</button>`)}`);
  };
  BL.fillStages = (select, withBlank) => {
    select.innerHTML = (withBlank ? '<option value="">Choose a stage</option>' : "") + BL.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  };

  // Reveal on scroll
  BL.reveal = (root) => {
    const items = BL.$$(".rv:not(.in)", root);
    if (!("IntersectionObserver" in window)) return items.forEach((i) => i.classList.add("in"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    items.forEach((i) => io.observe(i));
  };

  BL.ico = (name) => ({
    book: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    trips: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    jobs: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    pass: '<path d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l12-3v3M17 14h.01"/>',
    admin: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 004 0"/>',
  }[name] || "");
})();
