/* BodaLink service worker: fresh files first, saved copy when the phone is offline. Supabase and other sites are never touched. */
const CACHE = "bodalink-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") { const shell = (await caches.match("index.html")) || (await caches.match("./")); if (shell) return shell; }
      throw err;
    }
  })());
});
/* Web push, used once a push sender is connected */
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "BodaLink", { body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./#/alerts" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); return; } }
    await self.clients.openWindow(e.notification.data.url || "./#/");
  })());
});
