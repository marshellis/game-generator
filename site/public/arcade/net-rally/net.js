/*
 * net.js — Net Rally networking (WebRTC peer-to-peer via PeerJS)
 * ----------------------------------------------------------------------------
 * Two players, one 4-letter code. One HOSTS (claims the code as its peer id and
 * runs the authoritative rally); the other JOINS. Signaling uses PeerJS's free
 * public broker; the rally is direct P2P.
 *
 * ICE servers come from our own `/api/turn` endpoint. STUN alone only connects
 * peers on the SAME network — a TURN relay is required across different networks
 * / strict NATs. TURN is supplied via the `NETRALLY_ICE_SERVERS` env var (see
 * api/turn.ts); without it we fall back to STUN and cross-network simply can't
 * connect, so join() fails fast (~7s) with a clear message instead of hanging.
 *
 * Data-channel messages (see index.html):
 *   guest -> host: { t:"hello", name } | { t:"input", x }
 *   host  -> guest: { t:"hello", name } | { t:"start" } | { t:"state", ... } | { t:"over", ... }
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ID_PREFIX = "netrally-v1-";
  const STUN_FALLBACK = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  let iceCache = null;
  async function getIce() {
    if (iceCache) return iceCache;
    try {
      const r = await fetch("/api/turn", { credentials: "same-origin" });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.iceServers) && j.iceServers.length) { iceCache = j.iceServers; return iceCache; }
      }
    } catch (_) {}
    iceCache = STUN_FALLBACK;
    return iceCache;
  }
  // does the ICE config actually include a TURN relay? (drives the UX hint)
  async function hasTurn() {
    const ice = await getIce();
    return ice.some((s) => { const u = s && s.urls; const arr = Array.isArray(u) ? u : [u]; return arr.some((x) => /^turns?:/.test(String(x))); });
  }

  function online() { return typeof window.Peer === "function"; }
  async function getMe() {
    try { const r = await fetch("/api/me", { credentials: "same-origin" }); if (!r.ok) return null; const j = await r.json(); return j && j.username ? j : null; }
    catch (_) { return null; }
  }
  function cleanCode(raw) { return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
  function randomCode() { const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

  // ---- HOST: claim the code, accept one guest ----
  // handlers: { onStatus("connecting"|"waiting"|"taken"|"error"), onJoin(), onData(msg), onLeft() }
  function host(code, name, h) {
    h = h || {};
    const hostId = ID_PREFIX + cleanCode(code);
    let guest = null;
    const ctrl = {
      role: "host", peer: null, closed: false,
      broadcast(m) { if (guest && guest.open) { try { guest.send(m); } catch (_) {} } },
      send(m) { this.broadcast(m); },
      peerCount() { return guest ? 1 : 0; },
      close() { this.closed = true; try { if (guest) guest.close(); } catch (_) {} try { if (this.peer) this.peer.destroy(); } catch (_) {} },
    };
    h.onStatus && h.onStatus("connecting");
    getIce().then((ice) => {
      if (ctrl.closed) return;
      let peer;
      try { peer = new window.Peer(hostId, { debug: 1, config: { iceServers: ice } }); }
      catch (_) { h.onStatus && h.onStatus("error"); return; }
      ctrl.peer = peer;
      peer.on("open", () => { if (!ctrl.closed) h.onStatus && h.onStatus("waiting"); });
      peer.on("connection", (c) => {
        if (ctrl.closed) return;
        if (guest) { try { c.close(); } catch (_) {} return; }
        guest = c;
        c.on("open", () => { if (!ctrl.closed) h.onJoin && h.onJoin(); });
        c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d); });
        c.on("close", () => { guest = null; if (!ctrl.closed) h.onLeft && h.onLeft(); });
        c.on("error", () => {});
      });
      peer.on("disconnected", () => { if (!ctrl.closed) { try { peer.reconnect(); } catch (_) {} } });
      peer.on("error", (err) => { if (!ctrl.closed) h.onStatus && h.onStatus(err && err.type === "unavailable-id" ? "taken" : "error"); });
    });
    return ctrl;
  }

  // ---- JOIN: connect to a host's code, failing fast with a couple of retries ----
  // handlers: { onStatus("connecting"|"notfound"|"error"), onJoin(), onData(msg), onLeft() }
  function join(code, name, h) {
    h = h || {};
    const hostId = ID_PREFIX + cleanCode(code);
    const ctrl = {
      role: "guest", peer: null, hostConn: null, closed: false,
      send(m) { const c = this.hostConn; if (c && c.open) { try { c.send(m); } catch (_) {} } },
      broadcast(m) { this.send(m); },
      peerCount() { return this.hostConn && this.hostConn.open ? 1 : 0; },
      close() { this.closed = true; try { if (this.hostConn) this.hostConn.close(); } catch (_) {} try { if (this.peer) this.peer.destroy(); } catch (_) {} },
    };
    h.onStatus && h.onStatus("connecting");
    let attempts = 0, done = false;
    function fail(reason) { if (!done) { done = true; h.onStatus && h.onStatus(reason); } }

    getIce().then((ice) => {
      if (ctrl.closed) return;
      let peer;
      try { peer = new window.Peer({ debug: 1, config: { iceServers: ice } }); }
      catch (_) { return fail("error"); }
      ctrl.peer = peer;

      function tryConnect() {
        if (ctrl.closed || done) return;
        attempts++;
        const c = peer.connect(hostId, { reliable: true, metadata: { name } });
        ctrl.hostConn = c;
        const t = setTimeout(() => { if (!done && !(c && c.open)) { try { c.close(); } catch (_) {} retry(); } }, 3500);
        c.on("open", () => { if (done) return; clearTimeout(t); done = true; h.onJoin && h.onJoin(); });
        c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d); });
        c.on("close", () => { if (!ctrl.closed && done) h.onLeft && h.onLeft(); });
        c.on("error", () => {});
      }
      function retry() { if (ctrl.closed || done) return; if (attempts >= 2) return fail("notfound"); setTimeout(tryConnect, 800); }

      peer.on("open", () => { if (!ctrl.closed) tryConnect(); });
      peer.on("error", (err) => { if (ctrl.closed || done) return; if (err && err.type === "peer-unavailable") retry(); else fail("error"); });
    });
    return ctrl;
  }

  window.NetRally = { online, getMe, cleanCode, randomCode, host, join, hasTurn };
})();
