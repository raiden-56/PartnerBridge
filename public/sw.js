/* PartnerBridge service worker
 *
 * Caching rules (security-first):
 *  - Static build assets (/_next/static, icons, fonts): cache-first in a versioned cache.
 *  - Public marketing pages ("/", "/how-it-works", "/pricing", "/resources", "/privacy", "/terms"):
 *    network-first, cached copy used only when offline.
 *  - Everything else — /dashboard, /admin, /api, /auth, company/opportunity pages that may
 *    contain user-specific UI — is NEVER cached. Offline navigations fall back to /offline.
 *  - On logout the page posts CLEAR_USER_DATA and runtime caches are wiped.
 */
const VERSION = "pb-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-public-pages`;
const OFFLINE_URL = "/offline";
const PUBLIC_PAGES = ["/", "/how-it-works", "/pricing", "/resources", "/privacy", "/terms"];
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_USER_DATA") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|svg|ico|webp)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never touch private or dynamic areas.
  if (/^\/(api|dashboard|admin|auth|onboarding|invite|local-sb)(\/|$)/.test(url.pathname)) {
    if (req.mode === "navigate") {
      event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = PUBLIC_PAGES.includes(url.pathname) && !url.search;
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache public pages, and only responses that are not personalised (no auth cookie present on page).
          if (cacheable && res.ok && res.headers.get("x-pb-public") !== "0") {
            const copy = res.clone();
            caches.open(PAGES_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (cacheable && (await caches.match(req))) || caches.match(OFFLINE_URL)),
    );
  }
});

/* ── Push notifications (only delivered after the user granted permission) ── */
self.addEventListener("push", (event) => {
  let data = { title: "PartnerBridge", body: "", link: "/dashboard/notifications", tag: "pb" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* ignore malformed payloads */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link: data.link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.navigate(link).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    })(),
  );
});

/* ── Background sync: deliver messages composed while offline ── */
function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pb-outbox", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("messages", { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function drainOutbox() {
  const db = await openOutbox();
  const items = await new Promise((resolve) => {
    const out = [];
    const tx = db.transaction("messages", "readonly");
    tx.objectStore("messages").openCursor().onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        out.push(cur.value);
        cur.continue();
      } else resolve(out);
    };
  });
  for (const m of items) {
    const res = await fetch("/api/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: m.conversationId, body: m.body, clientId: m.clientId }),
    });
    if (res.ok || res.status === 400 || res.status === 403) {
      // Delivered, or permanently rejected — remove from outbox.
      await new Promise((r) => {
        const tx = db.transaction("messages", "readwrite");
        tx.objectStore("messages").delete(m.clientId);
        tx.oncomplete = r;
      });
    } else {
      throw new Error("retry later");
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "pb-outbox") event.waitUntil(drainOutbox());
});
