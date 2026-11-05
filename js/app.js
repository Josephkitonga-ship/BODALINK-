/* Boot, alert counter, install button and the periodic sweep. */
(function () {
  const BL = (window.BL = window.BL || {});
  let unread = 0, unsub = null;

  BL.notifications = {
    paint() {
      BL.$$("[data-badge=alerts]").forEach((n) => { n.hidden = !unread; n.textContent = unread > 9 ? "9+" : unread; });
    },
    async refresh() {
      if (!BL.api.authed) return;
      try { unread = (await BL.api.list("notifications", { filter: "read = false", perPage: 50 })).length; } catch (_) {}
      BL.notifications.paint();
    },
  };

  function listen() {
    if (unsub) unsub();
    unsub = null;
    if (!BL.api.authed) return;
    BL.notifications.refresh();
    unsub = BL.realtime.on("notifications/*", (ev) => {
      if (ev.action !== "create" || ev.record.member !== BL.api.me.id) return;
      unread++; BL.notifications.paint();
      BL.toast(ev.record.title + (ev.record.body ? ". " + ev.record.body : ""), "ok");
      if (["ride", "parcel", "assigned", "bid"].indexOf(ev.record.kind) > -1) BL.beep();
    });
  }

  // Install: use the phone's own prompt when there is one, otherwise show how to add it from the browser menu
  let deferred = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; BL.emit("installable", true); BL.router.chrome(); });
  window.addEventListener("appinstalled", () => { deferred = null; BL.toast("BodaLink is installed.", "ok"); BL.router.chrome(); });
  BL.canInstall = () => !standalone();
  BL.installApp = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; BL.router.chrome(); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    BL.sheet(BL.h`<h3>Install BodaLink</h3><ol class="steps" style="margin-top:14px">${(ios
      ? ["Tap the Share button in Safari.", "Choose Add to Home Screen.", "Tap Add."]
      : ["Open the browser menu (the three dots).", "Tap Install app, or Add to Home screen.", "Tap Install. The BodaLink icon appears on your phone."]).map((t) => BL.h`<li class="done">${t}</li>`)}</ol>
      <p class="hint" style="margin-bottom:14px">It opens full screen like any app and keeps working on a weak connection.</p><button class="btn btn--dark btn--block" data-close>Got it</button>`);
  };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-install]")) BL.installApp(); });

  BL.on("auth", () => { listen(); BL.router.chrome(); });

  async function boot() {
    await BL.api.loadConfig();
    await BL.loadPlaces();
    if (BL.api.authed) await BL.api.refresh();
    listen();
    BL.router.start();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    // Keeps bidding windows moving even if nobody else is online to nudge them
    setInterval(() => { if (BL.api.authed && !document.hidden) BL.api.post("/api/bl/sweep").catch(() => {}); }, 20000);
  }
  boot();
})();
