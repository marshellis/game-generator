/* Marshellis game SDK - one shared account + leaderboard for every arcade game.
 *
 *   <div id="mg-chip"></div> <div id="mg-account"></div> <div id="mg-board"></div>
 *   <script src="/arcade/_sdk/marshellis.js"></script>
 *   const mg = Marshellis.init({ game: "flappy", chip: "#mg-chip", account: "#mg-account",
 *                                board: "#mg-board", onChange: (me) => {} });
 *   mg.who()                -> { username, avatar, avatarColor } | null  (null = guest)
 *   await mg.submitScore(n) -> { best } | null     (guests: no-op, keep best on the device)
 *   mg.refreshBoard()
 *   await mg.gate()         -> true when allowed to start a round (shows learning breaks / time-up screens)
 *   mg.startPlaying() / await mg.roundEnded()   -> play clock + round counting for parent time limits
 *   opts.picker: mount point for the "Who's playing?" profile picker (phone-handoff)
 *
 * Games never implement sign-in themselves. All calls degrade silently: gameplay never
 * depends on the network. Same-origin only (the arcade iframe keeps allow-same-origin).
 * Every element is optional - omit a mount point and that piece is not drawn.
 */
(function (root) {
  "use strict";
  var AVATARS = ["🦊","🐼","🐯","🦁","🐸","🐵","🐙","🦄","🐶","🐱","🐧","🐝","🦖","🐢","🦉","🐳"];
  var DEFAULT_COLOR = "#fde68a";
  var USER_RE = /^[a-z0-9_-]{3,20}$/;
  var PIN_RE = /^[0-9]{4,8}$/;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function validate(username, pin) {
    var u = String(username || "").trim().toLowerCase(), p = String(pin || "").trim();
    if (!USER_RE.test(u)) return { error: "Username: 3–20 letters, numbers, - or _." };
    if (!PIN_RE.test(p)) return { error: "PIN must be 4–8 digits." };
    return { u: u, p: p };
  }

  var CSS = ".mg-box{background:#1e293b;border-radius:12px;padding:14px;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}" +
    ".mg-title{font-size:14px;font-weight:600;color:#93c5fd;margin-bottom:10px;display:flex;justify-content:space-between}" +
    ".mg-row{display:flex;gap:8px;margin-bottom:8px}" +
    ".mg-box input{flex:1;min-width:0;padding:10px 11px;font-size:15px;border:1px solid #334155;border-radius:9px;background:#0f172a;color:#fff}" +
    ".mg-box input:focus{outline:none;border-color:#f9d71c}" +
    ".mg-avs{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 10px}" +
    ".mg-avs button{width:30px;height:30px;border:2px solid transparent;border-radius:8px;background:#0f172a;font-size:17px;cursor:pointer;line-height:1;padding:0}" +
    ".mg-avs button.sel{border-color:#f9d71c;background:#2a3445}" +
    ".mg-btns button{flex:1;font:inherit;font-size:15px;border:0;border-radius:9px;padding:11px;cursor:pointer}" +
    ".mg-login{background:#334155;color:#e2e8f0}.mg-create{background:#f9d71c;color:#1c2530;font-weight:600}" +
    ".mg-msg{min-height:17px;font-size:13px;margin-top:8px}.mg-msg.err{color:#ff8a7a}.mg-msg.ok{color:#8fe388}.mg-msg.busy{color:#94a3b8}" +
    ".mg-note{font-size:12px;color:#64748b;margin-top:8px}" +
    ".mg-chip{display:flex;align-items:center;gap:8px;font-size:14px;color:#e2e8f0}" +
    ".mg-av{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;font-size:16px}" +
    ".mg-chip button{margin-left:auto;font:inherit;font-size:12px;background:#334155;color:#e2e8f0;border:0;border-radius:8px;padding:5px 9px;cursor:pointer}" +
    ".mg-board ol{list-style:none;margin:0;padding:0}" +
    ".mg-board li{display:flex;gap:10px;padding:5px 0;font-size:14px;border-top:1px solid rgba(255,255,255,.06)}.mg-board li:first-child{border-top:0}" +
    ".mg-rk{width:22px;color:#64748b}.mg-nm{flex:1}.mg-sc{color:#f9d71c;font-weight:700}.mg-board li.me .mg-nm::after{content:' (you)';color:#93c5fd;font-size:12px}.mg-empty{color:#64748b;font-size:13px}" +
    ".mg-pick{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.mg-pick button{background:#1e293b;border:2px solid #334155;border-radius:12px;color:#e2e8f0;padding:8px 12px;font:inherit;cursor:pointer;display:flex;gap:8px;align-items:center}" +
    ".mg-ov{position:fixed;inset:0;background:rgba(2,6,23,.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e2e8f0}" +
    ".mg-card{background:#1e293b;border-radius:16px;padding:20px;width:min(94vw,420px);text-align:center}" +
    ".mg-q{font-size:26px;font-weight:700;margin:14px 0}.mg-ch{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
    ".mg-ch button,.mg-card .mg-go{font:inherit;font-size:20px;padding:14px;border:0;border-radius:12px;background:#334155;color:#fff;cursor:pointer}" +
    ".mg-ch button.ok{background:#16a34a}.mg-ch button.bad{background:#dc2626}.mg-card .mg-go{background:#f9d71c;color:#1c2530;font-weight:700;margin-top:14px;width:100%}" +
    ".mg-sub{color:#93c5fd;font-size:14px}";

  function init(opts) {
    var doc = root.document, game = opts.game, me = null, chosen = AVATARS[0];
    var $ = function (sel) { return sel ? doc.querySelector(sel) : null; };
    var chipEl = $(opts.chip), accEl = $(opts.account), boardEl = $(opts.board);
    var st = doc.createElement("style"); st.textContent = CSS; doc.head.appendChild(st);

    function api(path, o) {
      try {
        var h = o && o.body ? { "content-type": "application/json" } : undefined;
        return root.fetch(path, Object.assign({ credentials: "same-origin", headers: h }, o));
      } catch (e) { return Promise.resolve(null); }
    }
    function safe(p) { return p.catch(function () { return null; }); }

    // ---- chip + account form
    var uEl, pEl, msgEl, loginBtn, createBtn;
    if (accEl) {
      accEl.innerHTML = '<div class="mg-box"><div class="mg-title">Create an account to join the leaderboard</div>' +
        '<div class="mg-row"><input class="mg-u" type="text" maxlength="20" placeholder="Username" autocomplete="off" autocapitalize="off">' +
        '<input class="mg-p" type="password" inputmode="numeric" maxlength="8" placeholder="PIN (4–8 digits)" autocomplete="off"></div>' +
        '<div class="mg-avs"></div><div class="mg-row mg-btns"><button class="mg-login">Log in</button><button class="mg-create">Create account</button></div>' +
        '<div class="mg-msg"></div><div class="mg-note">…or just play as a guest — your best is saved on this device.</div></div>';
      uEl = accEl.querySelector(".mg-u"); pEl = accEl.querySelector(".mg-p"); msgEl = accEl.querySelector(".mg-msg");
      loginBtn = accEl.querySelector(".mg-login"); createBtn = accEl.querySelector(".mg-create");
      var avs = accEl.querySelector(".mg-avs");
      AVATARS.forEach(function (a, i) {
        var b = doc.createElement("button"); b.textContent = a; if (i === 0) b.className = "sel";
        b.onclick = function () {
          chosen = a; Array.prototype.forEach.call(avs.children, function (c) { c.classList.remove("sel"); }); b.classList.add("sel");
        };
        avs.appendChild(b);
      });
      loginBtn.onclick = function () { auth("login"); };
      createBtn.onclick = function () { auth("signup"); };
      uEl.addEventListener("keydown", function (e) { if (e.key === "Enter") pEl.focus(); });
      pEl.addEventListener("keydown", function (e) { if (e.key === "Enter") auth("login"); });
    }
    function setMsg(t, k) { if (msgEl) { msgEl.textContent = t || ""; msgEl.className = "mg-msg " + (k || ""); } }
    function busy(on) { if (loginBtn) { loginBtn.disabled = on; createBtn.disabled = on; } }

    function render() {
      if (accEl) accEl.hidden = !!me;
      if (!chipEl) return;
      if (!me) { chipEl.innerHTML = ""; return; }
      chipEl.innerHTML = '<div class="mg-chip"><span class="mg-av" style="background:' + esc(me.avatarColor || DEFAULT_COLOR) + '">' +
        esc(me.avatar || AVATARS[0]) + "</span>Playing as <b>" + esc(me.username) + '</b><button>Log out</button></div>';
      chipEl.querySelector("button").onclick = logout;
    }
    function changed() { render(); refreshBoard(); if (opts.onChange) opts.onChange(me); }

    async function auth(kind) {
      var v = validate(uEl.value, pEl.value);
      if (v.error) return setMsg(v.error, "err");
      busy(true); setMsg(kind === "signup" ? "Creating account…" : "Logging in…", "busy");
      var body = kind === "signup"
        ? { username: v.u, pin: v.p, avatar: chosen, avatarColor: DEFAULT_COLOR } : { username: v.u, pin: v.p };
      var r = await safe(api("/api/auth/" + kind, { method: "POST", body: JSON.stringify(body) }));
      busy(false);
      if (!r) return setMsg("Network error — try again.", "err");
      if (r.status === 409) return setMsg("Username taken — log in or pick another.", "err");
      if (r.status === 429) return setMsg("Too many tries — wait a few minutes.", "err");
      if (!r.ok) return setMsg(kind === "signup" ? "Check your username and PIN." : "Wrong username or PIN.", "err");
      me = await r.json(); uEl.value = ""; pEl.value = ""; setMsg("", ""); changed();
    }
    async function logout() { await safe(api("/api/auth/logout", { method: "POST" })); me = null; changed(); }

    async function load() {
      var r = await safe(api("/api/me"));
      me = r && r.ok ? await r.json() : null;
      changed();
    }

    // ---- scores + leaderboard
    async function submitScore(score) {
      if (!me) return null;
      var r = await safe(api("/api/scores", { method: "POST", body: JSON.stringify({ game: game, score: score }) }));
      var out = r && r.ok ? await r.json() : null;
      refreshBoard();
      return out;
    }
    async function refreshBoard() {
      if (!boardEl) return;
      var r = await safe(api("/api/leaderboard?game=" + encodeURIComponent(game) + "&limit=10"));
      if (!r || !r.ok) return;
      var top = (await r.json()).top || [];
      var rows = top.length ? top.map(function (row) {
        return "<li" + (me && row.username === me.username ? ' class="me"' : "") + '><span class="mg-rk">' + row.rank +
          '</span><span class="mg-nm">' + esc(row.username) + '</span><span class="mg-sc">' + row.score + "</span></li>";
      }).join("") : '<li class="mg-empty">No scores yet — be the first!</li>';
      boardEl.innerHTML = '<div class="mg-box mg-board"><div class="mg-title"><span>Global leaderboard</span><span style="color:#5dcaa5">● live</span></div><ol>' + rows + "</ol></div>";
    }

    // ---- profile picker (phone-handoff): the parent's device lists the kids; tap one to play as them
    var pickEl = $(opts.picker);
    async function loadPicker() {
      if (!pickEl) return;
      var r = await safe(api("/api/family/picker"));
      if (!r || !r.ok) { pickEl.innerHTML = ""; return; }
      var j = await r.json();
      if (!j.profiles.length) { pickEl.innerHTML = ""; return; }
      pickEl.innerHTML = '<div class="mg-box"><div class="mg-title">Who\'s playing?</div><div class="mg-pick"></div></div>';
      var box = pickEl.querySelector(".mg-pick");
      j.profiles.forEach(function (p) {
        var b = doc.createElement("button");
        b.innerHTML = '<span class="mg-av" style="background:' + esc(p.avatarColor) + '">' + esc(p.avatar) + "</span>" + esc(p.username) + (p.locked ? " \ud83d\udd12" : "");
        b.onclick = async function () {
          var pin = p.locked ? root.prompt("PIN for " + p.username) : undefined;
          if (p.locked && !pin) return;
          var r2 = await safe(api("/api/family/switch", { method: "POST", body: JSON.stringify({ username: p.username, pin: pin }) }));
          if (!r2 || !r2.ok) return root.alert("That PIN didn't work.");
          await load(); loadPicker();
        };
        box.appendChild(b);
      });
    }

    // ---- play gate: parent-set time limits and learning breaks (managed profiles only)
    var timer = null, lastTick = 0;
    async function status() {
      var r = await safe(api("/api/family/play/status"));
      return r && r.ok ? await r.json() : { ok: true, unmanaged: true };
    }
    function overlay(html) {
      var ov = doc.createElement("div"); ov.className = "mg-ov"; ov.innerHTML = '<div class="mg-card">' + html + "</div>";
      doc.body.appendChild(ov); return ov;
    }
    function fmt(sec) { var m = Math.floor(sec / 60); return m >= 1 ? m + " min" : sec + " sec"; }

    // Show N quick questions. Resolves with the final status. Wrong answers just move on - no penalty.
    function learn(count) {
      return new Promise(async function (resolve) {
        var r = await safe(api("/api/family/learn/next?count=" + count));
        if (!r || !r.ok) { var st0 = await status(); return resolve(st0); }
        var items = (await r.json()).items, i = 0, last = null, before = await status();
        var ov = overlay("");
        var card = ov.firstChild;
        function show() {
          if (i >= items.length) {
            card.innerHTML = '<div class="mg-sub">Nice work!</div><div class="mg-q">+' + fmt(Math.max(0, (last ? last.remainingSec : 0) - (before.remainingSec || 0))) + ' of play time</div><button class="mg-go">Play</button>';
            card.querySelector(".mg-go").onclick = function () { ov.remove(); resolve(last); };
            return;
          }
          var it = items[i];
          card.innerHTML = '<div class="mg-sub">Quick brain break ' + (i + 1) + " of " + items.length + '</div><div class="mg-q">' + esc(it.prompt) + '</div><div class="mg-ch"></div>';
          var box = card.querySelector(".mg-ch");
          it.choices.forEach(function (c) {
            var b = doc.createElement("button"); b.textContent = c;
            b.onclick = async function () {
              Array.prototype.forEach.call(box.children, function (x) { x.disabled = true; });
              var r2 = await safe(api("/api/family/learn/answer", { method: "POST", body: JSON.stringify({ id: it.id, token: it.token, choice: c }) }));
              var j = r2 && r2.ok ? await r2.json() : { correct: false };
              b.className = j.correct ? "ok" : "bad";
              if (j.remainingSec !== undefined) last = j;
              i++; setTimeout(show, 700);
            };
            box.appendChild(b);
          });
        }
        show();
      });
    }

    // await mg.gate() before starting each round. Resolves true when the child may play, false if time is up for today.
    async function gate() {
      var st = await status();
      if (st.unmanaged || !me) return true;
      while (!st.ok || st.breakNow) {
        if (!st.ok && st.reason === "limit") {
          await new Promise(function (res) {
            var ov = overlay('<div class="mg-q">That\'s all the play time for today</div><div class="mg-sub">See you tomorrow!</div><button class="mg-go">OK</button>');
            ov.querySelector(".mg-go").onclick = function () { ov.remove(); res(); };
          });
          return false;
        }
        st = await learn(st.questionsPerBreak || 3);
        if (st.ok && !st.breakNow) break;
        if (st.ok) break; // a voluntary break was done; do not loop on it
      }
      return true;
    }
    function startPlaying() {
      if (timer || !me) return;
      lastTick = Date.now();
      timer = root.setInterval(function () { tickNow(false); }, 15000);
    }
    async function tickNow(round) {
      var secs = Math.round((Date.now() - lastTick) / 1000); lastTick = Date.now();
      var r = await safe(api("/api/family/play/tick", { method: "POST", body: JSON.stringify({ seconds: secs, round: round }) }));
      return r && r.ok ? await r.json() : null;
    }
    async function stopPlaying() { if (timer) { root.clearInterval(timer); timer = null; if (me) await tickNow(false); } }
    // call when a round/game-over happens: stops the clock and counts the round toward "break every N rounds"
    async function roundEnded() { if (timer) { root.clearInterval(timer); timer = null; } if (!me) return null; return tickNow(true); }

    load().then(loadPicker);
    return {
      who: function () { return me; }, submitScore: submitScore, refreshBoard: refreshBoard,
      gate: gate, startPlaying: startPlaying, stopPlaying: stopPlaying, roundEnded: roundEnded, learn: learn, status: status,
    };
  }

  var api = { init: init, _validate: validate, AVATARS: AVATARS };
  root.Marshellis = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
