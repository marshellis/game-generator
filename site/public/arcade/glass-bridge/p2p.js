/*
 * p2p.js — Glass Bridge public lobby, peer-to-peer fallback (PeerJS / WebRTC)
 * ----------------------------------------------------------------------------
 * Used when the dedicated Colyseus room (galaga-server.fly.dev) isn't
 * available. One well-known peer id acts as the public room: the first player
 * to claim it HOSTS (runs the authoritative shared bridge, star topology —
 * same pattern as snowball-arena); everyone else connects to it as a guest.
 *
 * The message protocol is IDENTICAL to the server room's, so the game wires
 * the same handlers to either transport:
 *   in : welcome, join, leave, pos, verdict, proven, break, fell, skipOk,
 *        assassinateResult, assassinated, killed, full
 *   out: pos, land, fell, skip, assassinate   (hello is sent internally)
 *
 * Host migration is by re-election: when the host vanishes every guest's
 * onClose fires with "host-left"; the game rejoins after a random jitter and
 * whoever claims the room id first is the new host. Joining players carry
 * their revealed-row knowledge in `hello`, and the host merges it, so the
 * bridge's revealed state survives migrations (unrevealed rows are re-rolled —
 * nobody knew them anyway).
 *
 * ICE comes from /api/turn (STUN fallback). STUN alone only connects peers on
 * the same network — see net-rally's net.js for the TURN story.
 * ----------------------------------------------------------------------------
 */
window.GBP2P = (function () {
  "use strict";

  // ?p2proom=<name> joins an alternate room — used for testing without
  // disturbing the real public room. Players never see this.
  const ROOM_ID = (new URLSearchParams(location.search).get("p2proom") || "mg-glassbridge-pub-v1").slice(0, 40);
  const MAX_PLAYERS = 12;
  const MAX_ROW = 5000;
  const STUN_FALLBACK = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  let iceCache = null;
  async function getIce() {
    if (iceCache) return iceCache;
    try {
      const r = await fetch("/api/turn");
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.iceServers) && j.iceServers.length) { iceCache = j.iceServers; return iceCache; }
      }
    } catch (e) {}
    iceCache = STUN_FALLBACK;
    return iceCache;
  }

  // ---- authoritative shared bridge (mirror of the server's GlassBridge) ----
  function makeBridge() {
    const rows = [];
    function ensureRows(n) {
      const t = Math.min(n, MAX_ROW);
      while (rows.length < t) rows.push({ safe: Math.random() < 0.5 ? 0 : 1, broken: false, proven: false });
    }
    function revealed() {
      const out = [];
      rows.forEach((r, i) => { if (r.broken || r.proven) out.push({ row: i + 1, safe: r.safe, broken: r.broken, proven: r.proven }); });
      return out;
    }
    function land(row, side) {
      if (!Number.isInteger(row) || row < 1 || row > MAX_ROW) return null;
      if (side !== 0 && side !== 1) return null;
      ensureRows(row + 40);
      const r = rows[row - 1];
      const ok = side === r.safe;
      const provedNow = ok && !r.proven;
      const brokeNow = !ok && !r.broken;
      if (ok) r.proven = true; else r.broken = true;
      return { ok, provedNow, brokeNow };
    }
    function prove(row) {
      if (!Number.isInteger(row) || row < 1 || row > MAX_ROW) return null;
      ensureRows(row + 40);
      const r = rows[row - 1];
      const provedNow = !r.proven;
      r.proven = true;
      return { side: r.safe, provedNow };
    }
    function peek(from, to) { // x-ray: private read, reveals nothing
      const a = Math.max(1, Math.trunc(from));
      const b = Math.min(MAX_ROW, Math.trunc(to), a + 120);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
      ensureRows(b + 10);
      const out = [];
      for (let row = a; row <= b; row++) out.push({ row: row, safe: rows[row - 1].safe });
      return out;
    }
    function merge(list) { // adopt the revealed knowledge a joining player carries
      (list || []).forEach(function (rv) {
        const row = Math.trunc(Number(rv && rv.row));
        if (!Number.isInteger(row) || row < 1 || row > MAX_ROW) return;
        ensureRows(row + 14);
        const r = rows[row - 1];
        if ((rv.safe === 0 || rv.safe === 1) && !r.broken && !r.proven) r.safe = rv.safe;
        if (rv.broken) r.broken = true;
        if (rv.proven) r.proven = true;
      });
    }
    ensureRows(40);
    return { ensureRows, revealed, land, prove, peek, merge };
  }

  // ---- host: runs the room, is also a player ("host" id) ----
  function hostRun(peer, opts) {
    const bridge = makeBridge();
    const players = new Map();
    players.set("host", { name: opts.name, x: 0, z: 0, h: 0, row: 0, st: "ready", conn: null });
    bridge.merge(opts.revealed);

    function toSelf(t, d) { try { opts.onMessage(t, d); } catch (e) {} }
    function sendTo(p, t, d) { if (p.conn) { try { p.conn.send({ t: t, d: d }); } catch (e) {} } else toSelf(t, d); }
    function broadcast(t, d, exceptId) { players.forEach(function (p, id) { if (id !== exceptId) sendTo(p, t, d); }); }

    function handle(id, t, d) {
      const p = players.get(id);
      if (!p) return;
      if (t === "pos") {
        p.x = Number(d && d.x) || 0; p.z = Number(d && d.z) || 0; p.h = Number(d && d.h) || 0;
        p.row = Math.max(0, Math.trunc(Number(d && d.row) || 0));
        p.st = String((d && d.st) || "").slice(0, 12);
        broadcast("pos", { id: id, x: p.x, z: p.z, h: p.h, st: p.st }, id);
      } else if (t === "land") {
        const row = Math.trunc(Number(d && d.row)), side = Math.trunc(Number(d && d.side));
        const out = bridge.land(row, side);
        if (!out) return;
        sendTo(p, "verdict", { row: row, ok: out.ok });
        if (out.ok) {
          p.row = Math.max(p.row, row);
          if (out.provedNow) broadcast("proven", { row: row, side: side, by: p.name });
        } else if (out.brokeNow) {
          broadcast("break", { row: row, side: side, by: p.name });
        }
        if (!out.ok) broadcast("fell", { id: id, name: p.name, row: row, cause: "glass" }, id);
      } else if (t === "skip") {
        const row = Math.trunc(Number(d && d.row));
        const res = bridge.prove(row);
        if (!res) return;
        sendTo(p, "skipOk", { row: row, side: res.side });
        p.row = Math.max(p.row, row);
        if (res.provedNow) broadcast("proven", { row: row, side: res.side, by: p.name });
      } else if (t === "xray") {
        const rows = bridge.peek(Number(d && d.from), Number(d && d.to));
        if (rows.length) sendTo(p, "xrayData", { rows: rows });
      } else if (t === "fell") {
        const cause = d && d.cause === "hole" ? "hole" : "gap";
        broadcast("fell", { id: id, name: p.name, row: Math.max(0, Math.trunc(Number(d && d.row) || 0)), cause: cause }, id);
      } else if (t === "assassinate") {
        const wanted = String((d && d.target) || "").trim().toLowerCase();
        let hitId = null, hitP = null;
        players.forEach(function (q, qid) { if (hitId === null && qid !== id && q.name.toLowerCase() === wanted) { hitId = qid; hitP = q; } });
        if (!wanted || hitId === null) { sendTo(p, "assassinateResult", { ok: false }); return; }
        sendTo(hitP, "killed", { by: p.name });
        sendTo(p, "assassinateResult", { ok: true, target: hitP.name });
        broadcast("assassinated", { by: p.name, target: hitP.name });
      }
    }

    peer.on("connection", function (conn) {
      if (players.size >= MAX_PLAYERS) {
        conn.on("open", function () { try { conn.send({ t: "full" }); } catch (e) {} setTimeout(function () { try { conn.close(); } catch (e) {} }, 300); });
        return;
      }
      const id = conn.peer;
      conn.on("data", function (msg) {
        if (!msg || typeof msg.t !== "string") return;
        if (msg.t === "hello") {
          const name = String((msg.d && msg.d.name) || "guest").slice(0, 20) || "guest";
          bridge.merge(msg.d && msg.d.revealed);
          players.set(id, { name: name, x: 0, z: 0, h: 0, row: 0, st: "ready", conn: conn });
          const others = [];
          players.forEach(function (q, qid) { if (qid !== id) others.push({ id: qid, name: q.name, x: q.x, z: q.z, h: q.h, st: q.st }); });
          try { conn.send({ t: "welcome", d: { id: id, revealed: bridge.revealed(), players: others } }); } catch (e) {}
          broadcast("join", { id: id, name: name }, id);
          return;
        }
        handle(id, msg.t, msg.d);
      });
      conn.on("close", function () {
        const q = players.get(id);
        if (!q) return;
        players.delete(id);
        broadcast("leave", { id: id, name: q.name });
      });
      conn.on("error", function () {});
    });

    // deliver the host's own welcome asynchronously, like a server would
    setTimeout(function () {
      toSelf("welcome", { id: "host", revealed: bridge.revealed(), players: [] });
    }, 0);

    let left = false;
    return {
      isHost: true,
      send: function (t, d) { if (t !== "hello") handle("host", t, d); },
      leave: function () {
        if (left) return; left = true;
        try { peer.destroy(); } catch (e) {}
        if (opts.onClose) opts.onClose("left");
      },
    };
  }

  // ---- guest: a single reliable data channel to the host ----
  function guestRun(peer, conn, opts) {
    let closedByUs = false;
    conn.on("data", function (msg) {
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "full") { closedByUs = true; try { peer.destroy(); } catch (e) {} if (opts.onClose) opts.onClose("full"); return; }
      try { opts.onMessage(msg.t, msg.d); } catch (e) {}
    });
    conn.on("close", function () {
      if (closedByUs) return;
      closedByUs = true;
      try { peer.destroy(); } catch (e) {}
      if (opts.onClose) opts.onClose("host-left");
    });
    try { conn.send({ t: "hello", d: { name: opts.name, revealed: opts.revealed } }); } catch (e) {}
    return {
      isHost: false,
      send: function (t, d) { try { conn.send({ t: t, d: d }); } catch (e) {} },
      leave: function () {
        if (closedByUs) return; closedByUs = true;
        try { conn.close(); } catch (e) {}
        try { peer.destroy(); } catch (e) {}
        if (opts.onClose) opts.onClose("left");
      },
    };
  }

  function tryHost(cfg) {
    return new Promise(function (resolve) {
      const p = new Peer(ROOM_ID, cfg);
      let settled = false;
      const to = setTimeout(function () { if (!settled) { settled = true; try { p.destroy(); } catch (e) {} resolve(null); } }, 7000);
      p.on("open", function () { if (!settled) { settled = true; clearTimeout(to); resolve(p); } });
      p.on("error", function (e) {
        if (settled) return;
        settled = true; clearTimeout(to);
        const taken = e && e.type === "unavailable-id";
        if (!taken) { try { p.destroy(); } catch (e2) {} }
        resolve(taken ? "taken" : null);
      });
    });
  }

  function tryJoin(cfg, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const p = new Peer(cfg);
      let settled = false;
      function fail(why) { if (!settled) { settled = true; clearTimeout(to); try { p.destroy(); } catch (e) {} reject(new Error(why)); } }
      const to = setTimeout(function () { fail("connect timeout"); }, timeoutMs || 9000);
      p.on("open", function () {
        const conn = p.connect(ROOM_ID, { reliable: true });
        conn.on("open", function () { if (!settled) { settled = true; clearTimeout(to); resolve({ peer: p, conn: conn }); } });
        conn.on("error", function () { fail("connect failed"); });
      });
      // "peer-unavailable" fires fast when nobody holds the room id
      p.on("error", function (e) { fail(e && e.type === "peer-unavailable" ? "no host" : "peer error"); });
    });
  }

  // join(opts): opts = { name, revealed, onMessage(t, d), onClose(reason) }
  // Guest-FIRST: probing for an existing host before claiming the room id
  // narrows the double-host race window on the shared public broker.
  async function join(opts) {
    const ice = await getIce();
    const cfg = { debug: 1, config: { iceServers: ice } };
    try {
      const g = await tryJoin(cfg, 6500);
      return guestRun(g.peer, g.conn, opts);
    } catch (e) { /* nobody home (or unreachable) — try to host */ }
    const hostPeer = await tryHost(cfg);
    if (hostPeer && hostPeer !== "taken") return hostRun(hostPeer, opts);
    if (hostPeer === null) throw new Error("broker unreachable");
    // claim raced — someone else just became host; join them
    const g2 = await tryJoin(cfg, 9000);
    return guestRun(g2.peer, g2.conn, opts);
  }

  return { join: join };
})();
