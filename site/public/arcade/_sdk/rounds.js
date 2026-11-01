/* MGRounds - the one-line way for a game to join the learning loop.
 *
 *   <script src="/arcade/_sdk/marshellis.js"></script>
 *   <script src="/arcade/_sdk/rounds.js" data-game="my-game"></script>
 *   ...in the game's "round / match / life is over" code path:   window.MGRounds && MGRounds.end();
 *
 * end() counts the round for the parent's rules ("a brain break every N rounds", the daily learning goal) and, when
 * it is time, shows the child a brain break over the game right at the game-over screen (the host page draws it, so
 * the game never has to). Time limits do NOT need this: the wrapper page enforces them for every game. Safe to call
 * from anywhere, any number of times (calls within 2.5s are one round), and it never throws.
 */
(function (root) {
  "use strict";
  var tag = root.document && root.document.currentScript;
  var game = (tag && tag.getAttribute("data-game")) || "game", mg = null, last = 0;
  function sdk() { if (!mg && root.Marshellis) mg = root.Marshellis.init({ game: game }); return mg; }
  root.MGRounds = {
    end: function () {
      try {
        var now = Date.now(); if (now - last < 2500) return; last = now;
        var m = sdk(); if (!m) return;
        Promise.resolve(m.roundEnded()).catch(function () {}).then(function () { return m.gate(); }).catch(function () {});
      } catch (e) { /* never break a game */ }
    },
    /** Optional: await this before starting a round to show a break first. Resolves true when the child may play. */
    gate: function () { try { var m = sdk(); return m ? m.gate() : Promise.resolve(true); } catch (e) { return Promise.resolve(true); } },
  };
  if (root.document) root.document.addEventListener("DOMContentLoaded", function () { sdk(); });
})(typeof window !== "undefined" ? window : globalThis);
