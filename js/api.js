/* BodaLink client: talks to Supabase. Plain script, no framework. */
(function () {
  const BL = (window.BL = window.BL || {});
  const C = (BL.config = window.BL_CONFIG || {});

  // Defaults. The real values are read from the settings table on start.
  BL.cfg = { pass_price: 100, pass_hours: 24, bid_seconds: 90, grace_seconds: 60, vapid_public_key: C.VAPID_PUBLIC_KEY || "", dev: false };

  BL.recovery = /type=recovery/.test(location.hash);   // arrived from a password reset email
  const handlers = {};
  BL.on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); return () => { handlers[evt] = handlers[evt].filter((f) => f !== fn); }; };
  BL.emit = (evt, data) => (handlers[evt] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  const NOCONN = "No connection. Check your data bundle and try again.";
  const sb = (BL.sb = window.supabase && C.SUPABASE_URL
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null);
  const need = () => { if (!sb) throw new Error(NOCONN); return sb; };
  BL.db = (table) => need().from(table);

  // Phone helper. The phone number is a contact number (riders and passengers call and WhatsApp each other).
  BL.normPhone = (raw) => {
    let p = String(raw || "").replace(/[^0-9]/g, "");
    if (p.length === 10 && (p.startsWith("07") || p.startsWith("01"))) p = "254" + p.slice(1);
    else if (p.length === 9 && (p.startsWith("7") || p.startsWith("1"))) p = "254" + p;
    return /^254[71]\d{8}$/.test(p) ? p : "";
  };

  function nice(err) {
    const m = (err && err.message) || String(err || "");
    if (/failed to fetch|networkerror|load failed/i.test(m)) return NOCONN;
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Confirm your email first. Open the link we sent you, then sign in.";
    if (/already registered|already been registered|database error saving new user|duplicate key/i.test(m)) return "That email or phone number already has an account. Sign in instead.";
    if (/email address.*invalid|invalid.*email|unable to validate email/i.test(m)) return "Enter a valid email address.";
    if (/password.*(short|least|weak)|weak password/i.test(m)) return "Choose a stronger password, at least 8 characters.";
    if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
    return m || "Something went wrong. Try again.";
  }

  // Await a Supabase query and return its data, or throw an Error with a plain message.
  async function q(builder) {
    let r;
    try { r = await builder; } catch (e) { throw new Error(nice(e)); }
    if (r.error) { const err = new Error(nice(r.error)); err.code = r.error.code; err.status = r.status; throw err; }
    return r.data;
  }

  let me = null;
  async function loadMe() {
    const { data } = await need().auth.getSession();
    if (!data.session) { me = null; return null; }
    const prof = await q(sb.from("profiles").select("*").eq("id", data.session.user.id).maybeSingle());
    me = prof ? Object.assign({}, prof, { email: data.session.user.email, email_confirmed: !!data.session.user.email_confirmed_at }) : null;
    return me;
  }
  async function afterAuth() {
    await loadMe();
    if (!me) { await sb.auth.signOut(); throw new Error("Your account setup did not finish. Contact BodaLink."); }
    BL.emit("auth", me);
  }

  const api = (BL.api = {
    get me() { return me; },
    get role() { return me && me.role; },
    get authed() { return !!me; },
    q,
    rpc: (fn, args) => q(need().rpc(fn, args || {})),
    async count(builder) {
      let r;
      try { r = await builder; } catch (e) { throw new Error(nice(e)); }
      if (r.error) throw new Error(nice(r.error));
      return r.count || 0;
    },

    async init() { try { await loadMe(); } catch (_) { me = null; } },
    async loadConfig() {
      try { (await q(need().from("settings").select("key,value"))).forEach((r) => (BL.cfg[r.key] = Number(r.value))); } catch (_) {}
    },

    async login(email, password) {
      const { error } = await need().auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password });
      if (error) throw new Error(nice(error));
      await afterAuth();
    },
    // Returns { confirm: true } when Supabase wants the email confirmed before the first sign in.
    async register(d) {
      const phone = BL.normPhone(d.phone);
      if (!phone) throw new Error("Enter a valid phone number.");
      const meta = { role: d.role, name: d.name, phone, national_id: d.national_id || "", plate: d.plate || "", emergency_name: d.emergency_name || "", emergency_phone: BL.normPhone(d.emergency_phone) };
      const { data, error } = await need().auth.signUp({ email: String(d.email).trim().toLowerCase(), password: d.password, options: { data: meta, emailRedirectTo: C.SITE_URL || undefined } });
      if (error) throw new Error(nice(error));
      if (!data.session) return { confirm: true };
      await afterAuth();
      return { confirm: false };
    },
    async resetPassword(email) {
      const { error } = await need().auth.resetPasswordForEmail(String(email || "").trim().toLowerCase(), { redirectTo: C.SITE_URL || undefined });
      if (error) throw new Error(nice(error));
    },
    async updatePassword(password) {
      const { error } = await need().auth.updateUser({ password });
      if (error) throw new Error(nice(error));
    },
    async refresh() {
      if (!me) return;
      try { await loadMe(); if (!me) return api.logout(); BL.emit("auth", me); } catch (_) {}
    },
    async logout() {
      me = null;
      BL.emit("auth", null);
      location.hash = "#/";
      try { await need().auth.signOut(); } catch (_) {}
    },

    // Rider documents are private: a short-lived link is made on demand.
    async docUrl(path) {
      if (!path) return "";
      const { data, error } = await need().storage.from("rider-docs").createSignedUrl(path, 300);
      return error ? "" : data.signedUrl;
    },
    async uploadDoc(field, blob) {
      const path = me.id + "/" + field + ".jpg";
      const { error } = await need().storage.from("rider-docs").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw new Error(nice(error));
      return path;
    },
    advertUrl: (path) => (path ? C.SUPABASE_URL + "/storage/v1/object/public/adverts/" + path : ""),
    async uploadAdvert(blob) {
      const path = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".jpg";
      const { error } = await need().storage.from("adverts").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(nice(error));
      return path;
    },
  });

  if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === "PASSWORD_RECOVERY") BL.recovery = true; if (evt === "SIGNED_OUT" && me) { me = null; BL.emit("auth", null); location.hash = "#/"; } });

  // Live changes. on("requests/*", fn) calls fn({ action: "create" | "update" | "delete", record }) for rows this person may see.
  BL.realtime = {
    on(topic, fn) {
      if (!sb) return () => {};
      const table = String(topic).split("/")[0];
      const ch = sb.channel("bl-" + table + "-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
          const rec = p.new && Object.keys(p.new).length ? p.new : p.old;
          try { fn({ action: { INSERT: "create", UPDATE: "update", DELETE: "delete" }[p.eventType], record: rec }); } catch (e) { console.error(e); }
        }).subscribe();
      return () => sb.removeChannel(ch);
    },
  };
})();
