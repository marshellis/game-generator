/*
 * net.js — Snowball Arena networking layer (WebRTC peer-to-peer via PeerJS)
 * ----------------------------------------------------------------------------
 * No server to deploy. Two players who type the SAME party code connect
 * browser-to-browser:
 *   - The FIRST to enter a code registers as that code's peer id -> becomes HOST.
 *   - The SECOND finds the id taken -> becomes GUEST and connects to the host.
 * The HOST runs the authoritative match sim and streams snapshots; the GUEST
 * sends its inputs and renders. (See game.js.)
 *
 * Data-channel messages:
 *   guest -> host: { t:"join", name } | { t:"input", input:{...} }
 *   host -> guest: { t:"welcome", id, foeName } | { t:"state", players, balls, score, events }
 *
 * Signaling uses PeerJS's free public broker (just to introduce the two peers);
 * actual game traffic is direct P2P. The peerjs library is vendored locally.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ID_PREFIX = "snowarena-v1-"; // namespaces our codes on the shared broker

  /** P2P needs no configuration, so online play is always available. */
  function online() { return typeof window.Peer === "function"; }

  /** Read the logged-in account name so online names match the arcade profile. */
  async function getMe() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.username ? j : null;
    } catch (_) { return null; }
  }

  function guestName() {
    const key = "snowball-arena:guest";
    let n = localStorage.getItem(key);
    if (!n) {
      n = "Player" + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(key, n);
    }
    return n;
  }

  /** Normalize a party code: A–Z / 0–9, uppercase, max 8 chars. */
  function cleanCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  /** Friendly, easy-to-share code (no ambiguous chars). */
  function randomCode() {
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  /**
   * Connect by party code. Decides host vs guest automatically.
   * handlers: { onStatus(state), onRole(role), onData(msg), onPeerJoin(), onPeerLeft() }
   * Returns { role, send(msg), close() }.
   */
  function connect(code, name, handlers) {
    const h = handlers || {};
    const hostId = ID_PREFIX + cleanCode(code);
    const ctrl = {
      role: null, peer: null, conn: null, closed: false,
      send(msg) { if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (_) {} } },
      close() {
        this.closed = true;
        try { if (this.conn) this.conn.close(); } catch (_) {}
        try { if (this.peer) this.peer.destroy(); } catch (_) {}
      },
    };

    function wireConn(c) {
      ctrl.conn = c;
      c.on("open", () => { if (!ctrl.closed) { h.onStatus && h.onStatus("live"); h.onPeerJoin && h.onPeerJoin(); } });
      c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d); });
      c.on("close", () => { if (!ctrl.closed) h.onPeerLeft && h.onPeerLeft(); });
      c.on("error", () => {});
    }

    function becomeGuest() {
      const gp = new window.Peer({ debug: 1 });
      ctrl.peer = gp;
      ctrl.role = "guest";
      h.onRole && h.onRole("guest");
      gp.on("open", () => {
        if (ctrl.closed) return;
        const c = gp.connect(hostId, { reliable: true, metadata: { name } });
        wireConn(c);
      });
      gp.on("error", (e) => { if (!ctrl.closed) h.onStatus && h.onStatus("error"); });
    }

    // First try to claim the code as host.
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
      peer.on("connection", (c) => { if (!ctrl.conn) wireConn(c); });
    });

    peer.on("error", (err) => {
      if (ctrl.closed) return;
      // Code already claimed -> someone is hosting it; join as guest.
      if (err && err.type === "unavailable-id") {
        try { peer.destroy(); } catch (_) {}
        becomeGuest();
      } else if (err && (err.type === "peer-unavailable")) {
        h.onStatus && h.onStatus("error");
      } else {
        h.onStatus && h.onStatus("error");
      }
    });

    return ctrl;
  }

  window.SnowNet = { online, getMe, guestName, cleanCode, randomCode, connect };
})();
