/* Boot, notifications bell, install prompt and the periodic sweep. */
(function () {
  const BL = (window.BL = window.BL || {});
  let unread = 0, unsub = null;

  BL.notifications = {
    paint() { const n = BL.$("#bellN"); if (n) { n.hidden = !unread; n.textContent = unread > 9 ? "9+" : unread; } },
    async refresh() {
      if (!BL.api.authed) return;
      try { unread = (await BL.api.list("notifications", { filter: "read = false", perPage: 50 })).length; } catch (_) {}
      BL.notifications.paint();
    },
    async open() {
      let items = [];
      try { items = await BL.api.list("notifications", { sort: "-created", perPage: 30 }); } catch (_) {}
      BL.sheet(BL.h`<h3>Notifications</h3><div style="margin-top:6px">${items.length ? items.map((n) => BL.h`
        <a class="item" href="${(n.url || "/#/").replace("/#", "#")}" data-close style="text-decoration:none">
          <div class="grow"><div class="t">${n.title}</div><div class="s">${n.body}</div></div><span class="s">${BL.ago(n.created)}</span></a>`)
        : BL.h`<div class="empty">Nothing yet. Job and trip updates show up here.</div>`}</div>`);
      items.filter((n) => !n.read).forEach((n) => BL.api.update("notifications", n.id, { read: true }).catch(() => {}));
      unread = 0; BL.notifications.paint();
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

  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; BL.emit("installable", true); });
  BL.install = async () => { if (!deferred) return false; deferred.prompt(); await deferred.userChoice; deferred = null; return true; };
  BL.canInstall = () => !!deferred;

  BL.on("auth", () => { listen(); BL.router.chrome(); });

  async function boot() {
    await BL.api.loadConfig();
    await BL.loadStages();
    if (BL.api.authed) await BL.api.refresh();
    listen();
    BL.router.start();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    // Keeps bidding windows and unclaimed parcels moving even if nobody else is online to nudge them
    setInterval(() => { if (BL.api.authed && !document.hidden) BL.api.post("/api/bl/sweep").catch(() => {}); }, 20000);
  }
  boot();
})();
