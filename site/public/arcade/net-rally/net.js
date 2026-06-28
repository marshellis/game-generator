/*
 * net.js — Net Rally networking (WebRTC peer-to-peer via PeerJS)
 * ----------------------------------------------------------------------------
 * Two players, one 4-letter code. One HOSTS (claims the code as its peer id and
 * runs the authoritative rally); the other JOINS (connects to it). No server of
 * ours to deploy — signaling uses PeerJS's free public broker; the rally itself
 * is direct P2P.
 *
 * Reliability: we pass STUN *and* TURN ice servers so the data channel still
 * forms when the two players are on different networks / behind strict NATs
 * (STUN-only fails there). The guest also RETRIES the connect a few times, which
 * covers the common race where it taps Join a moment before the host is ready.
 *
 * Data-channel messages (see index.html):
 *   guest -> host: { t:"hello", name } | { t:"input", x }
 *   host  -> guest: { t:"hello", name } | { t:"start" } | { t:"state", ... } | { t:"over", ... }
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ID_PREFIX = "netrally-v1-"; // namespaces our codes on the shared broker

  // STUN finds your public address; TURN relays the data when a direct path is
  // impossible. The openrelay.metered.ca creds are a free public TURN service.
  const ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ];
  const peerOpts = () => ({ debug: 1, config: { iceServers: ICE } });

  function online() { return typeof window.Peer === "function"; }

  async function getMe() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.username ? j : null;
    } catch (_) { return null; }
  }

  function cleanCode(raw) { return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
  function randomCode() {
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
    let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  // ---- HOST: claim the code, accept one guest ----
  // handlers: { onStatus(s), onJoin(), onData(msg), onLeft() }
  //   onStatus: "connecting" | "waiting" | "taken" | "error"
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
    let peer;
    try { peer = new window.Peer(hostId, peerOpts()); } catch (_) { h.onStatus && h.onStatus("error"); return ctrl; }
    ctrl.peer = peer;
    h.onStatus && h.onStatus("connecting");
    peer.on("open", () => { if (!ctrl.closed) h.onStatus && h.onStatus("waiting"); });
    peer.on("connection", (c) => {
      if (ctrl.closed) return;
      if (guest) { try { c.close(); } catch (_) {} return; } // 2-player only
      guest = c;
      c.on("open", () => { if (!ctrl.closed) h.onJoin && h.onJoin(); });
      c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d); });
      c.on("close", () => { guest = null; if (!ctrl.closed) h.onLeft && h.onLeft(); });
      c.on("error", () => {});
    });
    peer.on("disconnected", () => { if (!ctrl.closed) { try { peer.reconnect(); } catch (_) {} } });
    peer.on("error", (err) => {
      if (ctrl.closed) return;
      h.onStatus && h.onStatus(err && err.type === "unavailable-id" ? "taken" : "error");
    });
    return ctrl;
  }

  // ---- JOIN: connect to a host's code, retrying through transient failures ----
  // handlers: { onStatus(s), onJoin(), onData(msg), onLeft() }
  //   onStatus: "connecting" | "notfound" | "error"
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
    let peer, attempts = 0, done = false;
    function fail(reason) { if (!done) { done = true; h.onStatus && h.onStatus(reason); } }
    try { peer = new window.Peer(peerOpts()); } catch (_) { fail("error"); return ctrl; }
    ctrl.peer = peer;
    h.onStatus && h.onStatus("connecting");

    function tryConnect() {
      if (ctrl.closed || done) return;
      attempts++;
      const c = peer.connect(hostId, { reliable: true, metadata: { name } });
      ctrl.hostConn = c;
      const t = setTimeout(() => { if (!done && !(c && c.open)) { try { c.close(); } catch (_) {} retry(); } }, 8000);
      c.on("open", () => { if (done) return; clearTimeout(t); done = true; h.onJoin && h.onJoin(); });
      c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d); });
      c.on("close", () => { if (!ctrl.closed && done) h.onLeft && h.onLeft(); });
      c.on("error", () => {});
    }
    function retry() { if (ctrl.closed || done) return; if (attempts >= 4) return fail("notfound"); setTimeout(tryConnect, 1500); }

    peer.on("open", () => { if (!ctrl.closed) tryConnect(); });
    peer.on("error", (err) => {
      if (ctrl.closed || done) return;
      if (err && err.type === "peer-unavailable") retry(); // host not up yet — try again
      else fail("error");
    });
    return ctrl;
  }

  window.NetRally = { online, getMe, cleanCode, randomCode, host, join };
})();
