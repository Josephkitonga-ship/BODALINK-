/* BodaLink service worker: offline app shell and push alerts. Bump CACHE when files change. */
const CACHE = "bodalink-v4";
const SHELL = ["./", "index.html", "css/tokens.css", "css/base.css", "css/components.css", "css/screens.css",
  "js/server.js", "js/api.js", "js/ui.js", "js/push.js", "js/router.js", "js/landing.js", "js/auth.js", "js/passenger.js", "js/me.js", "js/rider.js", "js/admin.js", "js/app.js",
  "views/landing.html", "views/auth.html", "views/book.html", "views/trip.html", "views/me.html", "views/rider.html", "views/pass.html", "views/join.html", "views/admin.html",
  "icons/icon.svg", "icons/icon-192.png", "manifest.webmanifest"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Static files: serve the cached copy at once, refresh it in the background. API calls always go to the network.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/_/")) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: "BodaLink", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "BodaLink", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || "bodalink", renotify: true, vibrate: [200, 100, 200], data: { url: d.url || "/#/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rel = ((e.notification.data && e.notification.data.url) || "/#/").replace(/^\//, "");
  const url = new URL(rel, self.registration.scope).href;   // works on a GitHub Pages sub-folder too
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const open = cs.find((c) => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
