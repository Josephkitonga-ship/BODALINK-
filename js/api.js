/* BodaLink client: talks to PocketBase. Plain script, no framework. */
(function () {
  const BL = (window.BL = window.BL || {});
  const KEY = "bl.session";
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}

  // Defaults. The server sends the real values from /api/bl/config.
  BL.cfg = { pass_price: 100, pass_hours: 24, bid_seconds: 90, grace_seconds: 60, vapid_public_key: "", dev: false };

  const handlers = {};
  BL.on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); return () => { handlers[evt] = handlers[evt].filter((f) => f !== fn); }; };
  BL.emit = (evt, data) => (handlers[evt] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  // Previewing the files from Acode (or any static server)? Add ?server=http://localhost:8090 to the address once.
  const asked = new URLSearchParams(location.search).get("server");
  if (asked !== null) asked ? localStorage.setItem("bl.server", asked) : localStorage.removeItem("bl.server");
  const base = () => (localStorage.getItem("bl.server") || window.BL_SERVER || "").replace(/\/$/, "");
  BL.server = () => base() || location.origin;
  BL.setServer = (u) => { u ? localStorage.setItem("bl.server", u.trim()) : localStorage.removeItem("bl.server"); location.reload(); };
  // Phone helpers. Keep these in step with pb_hooks/lib/bl.js
  BL.normPhone = (raw) => {
    let p = String(raw || "").replace(/[^0-9]/g, "");
    if (p.length === 10 && (p.startsWith("07") || p.startsWith("01"))) p = "254" + p.slice(1);
    else if (p.length === 9 && (p.startsWith("7") || p.startsWith("1"))) p = "254" + p;
    return /^254[71]\d{8}$/.test(p) ? p : "";
  };
  BL.derivePassword = (pin, phone) => "BL-" + pin + "-" + phone;

  function firstError(data) {
    const d = data && data.data;
    if (d) for (const k in d) if (d[k] && d[k].message) return d[k].message;
    return "";
  }

  async function req(method, path, body) {
    const headers = {};
    if (session) headers.Authorization = session.token;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(base() + path, { method, headers, body: payload }); }
    catch (_) { throw new Error("No connection. Check your data bundle and try again."); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (data === null && !res.ok) throw new Error("Cannot reach the BodaLink server at " + BL.server() + ". Start PocketBase, then tap Server settings at the bottom of the home page.");
    if (!res.ok) {
      if (res.status === 401 && session && path.indexOf("auth-with-password") < 0) api.logout();
      const err = new Error(firstError(data) || data.message || "Something went wrong. Try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const qs = (o) => {
    const p = new URLSearchParams();
    Object.keys(o || {}).forEach((k) => o[k] !== undefined && o[k] !== "" && p.set(k, o[k]));
    const s = p.toString();
    return s ? "?" + s : "";
  };
  const save = (s) => { session = s; s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); };

  const api = (BL.api = {
    get token() { return session && session.token; },
    get me() { return session && session.me; },
    get role() { return session && session.me && session.me.role; },
    get authed() { return !!session; },
    req,
    get: (path) => req("GET", path),
    post: (path, body) => req("POST", path, body || {}),
    async list(coll, o) {
      const r = await req("GET", "/api/collections/" + coll + "/records" + qs({ perPage: 50, ...o }));
      return r.items;
    },
    async count(coll, filter) { return (await req("GET", "/api/collections/" + coll + "/records" + qs({ perPage: 1, filter }))).totalItems; },
    one: (coll, id, o) => req("GET", "/api/collections/" + coll + "/records/" + id + qs(o)),
    create: (coll, data) => req("POST", "/api/collections/" + coll + "/records", data),
    update: (coll, id, data) => req("PATCH", "/api/collections/" + coll + "/records/" + id, data),

    async loadConfig() { try { Object.assign(BL.cfg, await req("GET", "/api/bl/config")); } catch (_) {} },

    async login(phone, pin) {
      const p = BL.normPhone(phone);
      if (!p) throw new Error("Enter a valid phone number.");
      const r = await req("POST", "/api/collections/members/auth-with-password", { identity: p, password: BL.derivePassword(pin, p) });
      api.setSession(r);
    },
    otp: (phone, purpose) => req("POST", "/api/bl/otp/request", { phone, purpose }),
    async register(data) {
      const p = BL.normPhone(data.phone);
      const { pin, ...rest } = data;
      api.setSession(await req("POST", "/api/bl/register", { ...rest, phone: p, password: BL.derivePassword(pin, p) }));
    },
    async reset(data) {
      const p = BL.normPhone(data.phone);
      api.setSession(await req("POST", "/api/bl/reset", { phone: p, otp: data.otp, password: BL.derivePassword(data.pin, p) }));
    },
    setSession(r) { save({ token: r.token, me: r.record }); realtime.restart(); BL.emit("auth", api.me); },
    async refresh() {
      if (!session) return;
      try { const r = await req("POST", "/api/collections/members/auth-refresh"); save({ token: r.token, me: r.record }); BL.emit("auth", api.me); }
      catch (e) { if (e.status === 401 || e.status === 403) api.logout(); }
    },
    logout() { save(null); realtime.stop(); BL.emit("auth", null); location.hash = "#/"; },

    // Protected files (ID photos) need a short-lived token
    async fileToken() {
      if (api._ft && Date.now() - api._ft.at < 90000) return api._ft.t;
      const r = await req("POST", "/api/files/token");
      api._ft = { t: r.token, at: Date.now() };
      return r.token;
    },
    fileUrl: (rec, field, token) => base() + "/api/files/" + rec.collectionId + "/" + rec.id + "/" + rec[field] + (token ? "?token=" + token : ""),
  });

  // Realtime over server-sent events. One connection, many topics.
  const realtime = (BL.realtime = {
    es: null, id: "", topics: new Map(), attached: new Set(), syncing: false, again: false,
    on(topic, fn) {
      if (!realtime.topics.has(topic)) realtime.topics.set(topic, new Set());
      realtime.topics.get(topic).add(fn);
      if (realtime.es && realtime.id) realtime.sync();
      realtime.start();
      return () => { const s = realtime.topics.get(topic); if (s) { s.delete(fn); if (!s.size) realtime.topics.delete(topic); } };
    },
    start() {
      if (realtime.es || !session) return;
      const es = (realtime.es = new EventSource(base() + "/api/realtime"));
      es.addEventListener("PB_CONNECT", (ev) => { realtime.id = JSON.parse(ev.data).clientId || ev.lastEventId; realtime.sync(); });
      es.onerror = () => { es.close(); realtime.es = null; realtime.id = ""; realtime.attached.clear(); realtime.syncing = false; setTimeout(realtime.start, 3000); };
    },
    stop() { if (realtime.es) realtime.es.close(); realtime.es = null; realtime.id = ""; realtime.attached.clear(); },
    restart() { realtime.stop(); realtime.start(); },
    // One subscription update at a time. Two quick updates can arrive out of order and drop a topic.
    async sync() {
      if (realtime.syncing) { realtime.again = true; return; }
      realtime.syncing = true;
      try {
        do {
          realtime.again = false;
          const es = realtime.es;
          if (!es || !realtime.id) break;
          realtime.topics.forEach((_, topic) => {
            if (realtime.attached.has(topic)) return;
            realtime.attached.add(topic);
            es.addEventListener(topic, (ev) => { const set = realtime.topics.get(topic); if (set) set.forEach((fn) => fn(JSON.parse(ev.data))); });
          });
          await req("POST", "/api/realtime", { clientId: realtime.id, subscriptions: [...realtime.topics.keys()] });
        } while (realtime.again);
      } catch (_) { /* the connection restarts itself if it dropped */ }
      realtime.syncing = false;
    },
  });
})();
