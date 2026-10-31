/* Host side of the third-party game bridge. Runs on OUR page that embeds an outside publisher's game
 * in a sandboxed iframe (no allow-same-origin), and answers the few requests that game may make.
 * The game never sees cookies or any account detail beyond nickname + avatar.
 *
 *   Marshellis host:  HostBridge.attach(iframe, { game: "slug", mg })   // mg = Marshellis.init(...)
 *   Game side:        parent.postMessage({ mg: 1, id: 1, type: "who" }, "*")  -> reply { mg:1, id:1, ok, data }
 *   Types: who | gate | roundEnded | startPlaying | submitScore {score}
 */
(function (root) {
  "use strict";
  var ALLOWED = { who: 1, gate: 1, roundEnded: 1, startPlaying: 1, submitScore: 1 };
  function attach(iframe, o) {
    function onMsg(ev) {
      if (ev.source !== iframe.contentWindow) return; // only our iframe
      var m = ev.data;
      if (!m || m.mg !== 1 || !ALLOWED[m.type]) return;
      Promise.resolve().then(function () {
        var me = o.mg.who();
        switch (m.type) {
          case "who": return me ? { username: me.username, avatar: me.avatar } : null;
          case "gate": return o.mg.gate();
          case "roundEnded": return o.mg.roundEnded().then(function () { return true; });
          case "startPlaying": o.mg.startPlaying(); return true;
          case "submitScore": return Number.isInteger(m.score) && m.score >= 0 ? o.mg.submitScore(m.score) : null;
        }
      }).then(function (data) {
        iframe.contentWindow.postMessage({ mg: 1, id: m.id, ok: true, data: data }, "*");
      }, function () { iframe.contentWindow.postMessage({ mg: 1, id: m.id, ok: false }, "*"); });
    }
    root.addEventListener("message", onMsg);
    return function detach() { root.removeEventListener("message", onMsg); };
  }
  root.HostBridge = { attach: attach, ALLOWED: ALLOWED };
})(window);
