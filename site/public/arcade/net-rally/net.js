/*
 * net.js — Net Rally networking (WebRTC peer-to-peer via PeerJS)
 * ----------------------------------------------------------------------------
 * No server to deploy. Two players who type the SAME code connect directly:
 *   - The FIRST to enter a code claims it as a peer id -> becomes HOST.
 *   - The SECOND connects to the host -> GUEST. (A 3rd is turned away.)
 * The HOST runs the authoritative rally and streams state to the guest; the
 * guest streams its racket position. Adapted from snowball-arena/net.js, trimmed
 * to a single guest (this is a 2-player co-op).
 *
 * Data-channel messages (see index.html):
 *   guest -> host: { t:"hello", name } | { t:"input", x }
 *   host  -> guest: { t:"hello", name } | { t:"state", ... } | { t:"over", score } | { t:"serve", ... }
 *
 * Signaling uses PeerJS's free public broker just to introduce peers; game
 * traffic is direct P2P. The peerjs library is vendored locally.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ID_PREFIX = "netrally-v1-"; // namespaces our codes on the shared broker

  function online() { return typeof window.Peer === "function"; }

  async function getMe() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.username ? j : null;
    } catch (_) { return null; }
  }

  function cleanCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }
  function randomCode() {
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
    let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  /**
   * Connect by code. Auto-decides host vs guest.
   * handlers: { onStatus(state), onRole(role), onPeerJoin(connId|null),
   *             onPeerLeft(connId|null), onData(msg, connId|null) }
   * Returns a controller: role, send(msg) [guest->host], broadcast(msg) [host->guest],
   *   peerCount(), close().
   */
  function connect(code, name, handlers) {
    const h = handlers || {};
    const hostId = ID_PREFIX + cleanCode(code);
    let guest = null; // the single guest's DataConnection (host only)

    const ctrl = {
      role: null, peer: null, hostConn: null, closed: false,
      send(msg) { const c = this.hostConn; if (c && c.open) { try { c.send(msg); } catch (_) {} } },
      broadcast(msg) { if (guest && guest.open) { try { guest.send(msg); } catch (_) {} } },
      peerCount() { return guest ? 1 : 0; },
      close() {
        this.closed = true;
        try { if (guest) guest.close(); } catch (_) {}
        try { if (this.hostConn) this.hostConn.close(); } catch (_) {}
        try { if (this.peer) this.peer.destroy(); } catch (_) {}
      },
    };

    // ---- host: accept exactly one guest ----
    function wireGuest(c) {
      if (guest) { try { c.close(); } catch (_) {} return; } // 2-player only — turn away extras
      guest = c;
      c.on("open", () => { if (!ctrl.closed) h.onPeerJoin && h.onPeerJoin("g1"); });
      c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d, "g1"); });
      c.on("close", () => { guest = null; if (!ctrl.closed) h.onPeerLeft && h.onPeerLeft("g1"); });
      c.on("error", () => {});
    }

    // ---- guest: single connection to the host ----
    function becomeGuest() {
      const gp = new window.Peer({ debug: 1 });
      ctrl.peer = gp;
      ctrl.role = "guest";
      h.onRole && h.onRole("guest");
      gp.on("open", () => {
        if (ctrl.closed) return;
        const c = gp.connect(hostId, { reliable: true, metadata: { name } });
        ctrl.hostConn = c;
        c.on("open", () => { if (!ctrl.closed) h.onPeerJoin && h.onPeerJoin(null); });
        c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d, null); });
        c.on("close", () => { if (!ctrl.closed) h.onPeerLeft && h.onPeerLeft(null); });
        c.on("error", () => {});
      });
      gp.on("error", () => { if (!ctrl.closed) h.onStatus && h.onStatus("error"); });
    }

    h.onStatus && h.onStatus("connecting");
    let peer;
    try { peer = new window.Peer(hostId, { debug: 1 }); }
    catch (_) { h.onStatus && h.onStatus("error"); return ctrl; }
    ctrl.peer = peer;

    peer.on("open", () => {
      if (ctrl.closed) return;
      ctrl.role = "host";
      h.onRole && h.onRole("host");
      h.onStatus && h.onStatus("waiting");
      peer.on("connection", (c) => { if (!ctrl.closed) wireGuest(c); });
    });

    peer.on("error", (err) => {
      if (ctrl.closed) return;
      if (err && err.type === "unavailable-id") { try { peer.destroy(); } catch (_) {} becomeGuest(); }
      else h.onStatus && h.onStatus("error");
    });

    return ctrl;
  }

  window.NetRally = { online, getMe, cleanCode, randomCode, connect };
})();
