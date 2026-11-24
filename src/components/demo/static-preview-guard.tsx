/**
 * Static read-only preview (GitHub Pages): the HTML was pre-rendered from the local demo,
 * and there is no server behind it. This inline script runs before React hydrates and:
 *  - answers every Server Action call with `{ ok: false, error }`, so forms and buttons show a
 *    normal "not available" message instead of failing;
 *  - blocks links to API routes (exports, invoices), which only exist on a running server.
 * Rendered only when NEXT_PUBLIC_STATIC_PREVIEW=1.
 */
const MESSAGE = "Read-only preview: changes are not saved here. Run PartnerBridge locally (npm run dev) to try this.";

const script = `(() => {
  const MSG = ${JSON.stringify(MESSAGE)};
  const notice = (text) => {
    let box = document.getElementById("pb-preview-notice");
    if (!box) {
      box = document.createElement("div");
      box.id = "pb-preview-notice";
      box.setAttribute("role", "status");
      box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,480px);padding:10px 14px;border-radius:10px;background:#172554;color:#fff;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)";
      document.body.appendChild(box);
    }
    box.textContent = text;
    clearTimeout(box._t);
    box._t = setTimeout(() => box.remove(), 4000);
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
    const method = ((init && init.method) || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST" && headers.has("next-action")) {
      const body = "0:" + JSON.stringify({ a: { ok: false, error: MSG }, i: false }) + "\\n";
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/x-component" } }));
    }
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    // The local Supabase stand-in doesn't exist here (only saved storage files do).
    if (url.origin === location.origin && url.pathname.includes("/local-sb/") && !url.pathname.includes("/storage/v1/object/")) {
      return Promise.resolve(new Response(JSON.stringify({ message: MSG }), { status: 503, headers: { "content-type": "application/json" } }));
    }
    // Link prefetches would download whole HTML pages (there is no RSC payload on a static host).
    // Skipping them is safe: navigation then loads the saved page directly.
    if (headers.has("next-router-prefetch")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return realFetch(input, init);
  };
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a) return;
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin === location.origin && /\\/(api|auth|local-sb)\\//.test(url.pathname) && !/\\/storage\\/v1\\/object\\//.test(url.pathname)) {
      e.preventDefault();
      notice("Downloads and exports need the running app. " + MSG);
    }
  }, true);
  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f instanceof HTMLFormElement && f.method.toLowerCase() === "get") return;
    if (f instanceof HTMLFormElement && !f.hasAttribute("data-pb-allow")) {
      // React-handled forms call preventDefault themselves; this only catches plain HTML posts.
      if (f.getAttribute("action") && !String(f.getAttribute("action")).startsWith("javascript:")) {
        e.preventDefault();
        notice(MSG);
      }
    }
  }, true);
})();`;

export function StaticPreviewGuard() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
