/* Marshellis compat shim - lets a game that calls the platform API directly (fetch("/api/scores"), "/api/me",
 * "/api/auth/*", "/api/family/pass") keep working when it runs on the isolated arcade origin.
 *
 *   <script src="/arcade/_sdk/compat.js"></script>     <- first thing in <head>
 *
 * On the isolated origin the game has no cookies and cannot reach the site, so same-origin /api/ fetches are
 * relayed through the wrapper page, which forwards ONLY an allowlist (see RELAY in marshellis.js). Anywhere else
 * (same-origin mode, opened directly) this file does nothing. New games should use marshellis.js instead.
 */
(function (root) {
  "use strict";
  var framed;
  try { framed = root.parent && root.parent !== root && root.parent.location.origin !== root.location.origin; }
  catch (e) { framed = root.parent !== root; }
  if (!framed || !root.fetch) return;
  var native = root.fetch.bind(root), seq = 0, pending = {};
  root.addEventListener("message", function (ev) {
    var m = ev.data;
    if (ev.source !== root.parent || !m || m.mg !== 1 || !pending[m.id]) return;
    var done = pending[m.id]; delete pending[m.id]; done(m);
  });
  root.fetch = function (input, init) {
    var raw = typeof input === "string" ? input : (input && input.url) || "", u;
    try { u = new URL(raw, root.location.href); } catch (e) { return native(input, init); }
    // /api/turn is public (no cookies) and the arcade origin serves it itself: no relay needed.
    if (u.origin !== root.location.origin || u.pathname.indexOf("/api/") !== 0 || u.pathname === "/api/turn") return native(input, init);
    var method = String((init && init.method) || "GET").toUpperCase(), body;
    try { body = init && init.body ? JSON.parse(init.body) : undefined; } catch (e) { body = undefined; }
    return new Promise(function (resolve, reject) {
      var id = "c" + (++seq); pending[id] = function (m) {
        if (!m || !m.status) return reject(new TypeError("Failed to fetch"));
        resolve(new Response(m.json === undefined || m.json === null ? null : JSON.stringify(m.json), { status: m.status, headers: { "content-type": "application/json" } }));
      };
      root.parent.postMessage({ mg: 1, id: id, type: "api", method: method, path: u.pathname + u.search, body: body }, "*");
      root.setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new TypeError("Failed to fetch")); } }, 45000);
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
