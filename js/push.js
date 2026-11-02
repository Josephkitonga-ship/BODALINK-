/* Web push: ask permission, subscribe, and save the subscription for the push worker. */
(function () {
  const BL = (window.BL = window.BL || {});
  const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  BL.push = {
    supported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    enabled: () => BL.push.supported() && Notification.permission === "granted",
    async enable() {
      if (!BL.push.supported()) throw new Error("This browser cannot show alerts. Try Chrome on Android.");
      if (!BL.cfg.vapid_public_key) throw new Error("Alerts are not switched on for this server yet.");
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Alerts are blocked. Allow notifications for BodaLink in your browser settings.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(BL.cfg.vapid_public_key) }));
      const j = sub.toJSON();
      try { await BL.api.create("push_subs", { member: BL.api.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }); } catch (_) { /* already saved */ }
    },
  };
})();
