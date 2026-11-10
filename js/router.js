/* Hash router with view panes. Views load their HTML on first visit. */
(function () {
  const BL = (window.BL = window.BL || {});
  BL.views = BL.views || {};
  const R = {
    "/": { v: "landing", pub: true }, "/auth": { v: "auth", pub: true },
    "/book": { v: "book", roles: ["passenger"] }, "/trip": { v: "trip", roles: ["passenger"] },
    "/alerts": { v: "alerts", roles: ["passenger", "rider", "admin"] }, "/me": { v: "me", roles: ["passenger", "rider", "admin"] },
    "/rider": { v: "rider", roles: ["rider"] }, "/pass": { v: "pass", roles: ["rider"] }, "/join": { v: "join", roles: ["rider"] },
    "/admin": { v: "admin", roles: ["admin"] },
  };
  const HOME = { passenger: "#/book", rider: "#/rider", admin: "#/admin" };
  const TABS = {
    passenger: [["#/book", "Home", "home"], ["#/trip", "Trips", "trips"], ["#/alerts", "Alerts", "alerts"], ["#/me", "Account", "me"]],
    rider: [["#/rider", "Jobs", "jobs"], ["#/pass", "Earnings", "pass"], ["#/alerts", "Alerts", "alerts"], ["#/me", "Account", "me"]],
    admin: [["#/admin", "Dashboard", "admin"], ["#/alerts", "Alerts", "alerts"], ["#/me", "Account", "me"]],
  };
  BL.home = () => HOME[BL.api.role] || "#/";

  const parse = () => {
    const h = location.hash.slice(1) || "/";
    const [path, q] = h.split("?");
    return { path: path === "" ? "/" : path, params: Object.fromEntries(new URLSearchParams(q || "")) };
  };

  let current = null;
  async function load(name) {
    let sec = BL.$("#view-" + name);
    if (sec) return sec;
    sec = document.createElement("section");
    sec.id = "view-" + name;
    sec.className = "view";
    BL.$("#views").appendChild(sec);
    try {
      const res = await fetch("views/" + name + ".html");
      sec.innerHTML = await res.text();
    } catch (_) { sec.innerHTML = '<div class="empty">This page needs a connection the first time you open it.</div>'; }
    const v = BL.views[name];
    if (v && v.mount) v.mount(sec);
    return sec;
  }

  async function go() {
    const { path, params } = parse();
    const r = R[path];
    if (!r) { location.hash = "#/"; return; }
    if (!r.pub && !BL.api.authed) { location.hash = "#/auth?next=" + encodeURIComponent(path); return; }
    if (r.roles && r.roles.indexOf(BL.api.role) < 0) { location.hash = BL.home(); return; }
    const token = (current = {});
    const sec = await load(r.v);
    if (token !== current) return;
    BL.$$(".view").forEach((s) => {
      const on = s === sec;
      if (s.classList.contains("on") && !on && BL.views[s.id.slice(5)] && BL.views[s.id.slice(5)].hide) BL.views[s.id.slice(5)].hide(s);
      s.classList.toggle("on", on);
    });
    chrome(path, r);
    const v = BL.views[r.v];
    if (v && v.show) v.show(sec, params);
    BL.reveal(sec);
    window.scrollTo(0, 0);
    document.title = (r.v === "landing" ? "BodaLink" : r.v[0].toUpperCase() + r.v.slice(1) + " | BodaLink");
  }

  function chrome(path, r) {
    const authed = BL.api.authed;
    const landing = r.v === "landing" && !authed;
    document.body.classList.toggle("public", !authed || r.v === "landing" || r.v === "auth");
    BL.$("#topbar").classList.remove("on-hero");
    BL.$("#navlinks").hidden = authed;
    const tb = BL.$("#tabbar");
    const tabs = authed && r.v !== "landing" ? TABS[BL.api.role] || [] : [];
    tb.hidden = !tabs.length;
    BL.html(tb, BL.h`${tabs.map(([href, label, ico]) => BL.h`<a href="${href}" ${href === "#" + path ? BL.raw('aria-current="page"') : ""}>
      <span class="pill"><svg viewBox="0 0 24 24" aria-hidden="true">${BL.raw(BL.ico(ico))}</svg>${ico === "alerts" ? BL.raw('<i class="nbadge" data-badge="alerts" hidden></i>') : ""}</span><span class="lbl">${label}</span></a>`)}`);
    BL.html(BL.$("#topright"), BL.h`${BL.canInstall && BL.canInstall() ? BL.h`<button class="btn btn--soft btn--sm" data-install>Install app</button>` : ""}${authed ? "" : BL.h`<a class="btn btn--dark btn--sm" href="#/auth?mode=login">Sign in</a>`}`);
    if (BL.notifications) BL.notifications.paint();
  }

  BL.router = { start() { window.addEventListener("hashchange", go); go(); }, go, parse, chrome: () => { const { path } = parse(); chrome(path, R[path] || R["/"]); } };
})();
