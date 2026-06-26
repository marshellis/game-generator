/*
 * net.js — Snowball Arena networking (WebRTC peer-to-peer via PeerJS)
 * ----------------------------------------------------------------------------
 * No server to deploy. Players who type the SAME party code connect:
 *   - The FIRST to enter a code claims it as a peer id -> becomes HOST.
 *   - Everyone after connects to the host -> GUESTS (up to 7, for 8-player FFA).
 * The HOST runs the authoritative match and streams snapshots to every guest;
 * guests send their inputs. Star topology (host = hub). (See game.js.)
 *
 * Data-channel messages:
 *   guest -> host: { t:"join", name, team } | { t:"input", input:{...} }
 *   host -> guest: { t:"welcome", id, mode, ... } | { t:"start", roster, mode }
 *                  | { t:"state", players, balls, frags, teamScore, events }
 *
 * Signaling uses PeerJS's free public broker just to introduce peers; game
 * traffic is direct P2P. The peerjs library is vendored locally.
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ID_PREFIX = "snowarena-v2-"; // namespaces our codes on the shared broker

  function online() { return typeof window.Peer === "function"; }

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
    if (!n) { n = "Player" + Math.floor(1000 + Math.random() * 9000); localStorage.setItem(key, n); }
    return n;
  }

  function cleanCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }
  function randomCode() {
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  /**
   * Connect by party code. Auto-decides host vs guest.
   * handlers: { onStatus(state), onRole(role), onPeerJoin(connId),
   *             onPeerLeft(connId), onData(msg, connId) }
   * Returns a controller:
   *   role, send(msg)            guest -> host
   *   broadcast(msg)             host -> all guests
   *   sendTo(connId, msg)        host -> one guest
   *   peerCount()                host: number of connected guests
   *   close()
   */
  function connect(code, name, handlers) {
    const h = handlers || {};
    const hostId = ID_PREFIX + cleanCode(code);
    const conns = new Map(); // connId -> DataConnection (host only)
    let nextConnId = 1;

    const ctrl = {
      role: null, peer: null, hostConn: null, closed: false,
      send(msg) { const c = this.hostConn; if (c && c.open) { try { c.send(msg); } catch (_) {} } },
      broadcast(msg) { conns.forEach((c) => { if (c.open) { try { c.send(msg); } catch (_) {} } }); },
      sendTo(id, msg) { const c = conns.get(id); if (c && c.open) { try { c.send(msg); } catch (_) {} } },
      peerCount() { return conns.size; },
      close() {
        this.closed = true;
        conns.forEach((c) => { try { c.close(); } catch (_) {} });
        try { if (this.hostConn) this.hostConn.close(); } catch (_) {}
        try { if (this.peer) this.peer.destroy(); } catch (_) {}
      },
    };

    // ---- host: accept many guests ----
    function wireGuest(c) {
      const id = "g" + (nextConnId++);
      conns.set(id, c);
      c.on("open", () => { if (!ctrl.closed) h.onPeerJoin && h.onPeerJoin(id); });
      c.on("data", (d) => { if (!ctrl.closed) h.onData && h.onData(d, id); });
      c.on("close", () => { conns.delete(id); if (!ctrl.closed) h.onPeerLeft && h.onPeerLeft(id); });
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

  window.SnowNet = { online, getMe, guestName, cleanCode, randomCode, connect };
})();
