/*
 * net.js — Snowball Arena networking layer
 * ----------------------------------------------------------------------------
 * Live PvP runs on a PartyKit server (see ../../../realtime/). Each "party code"
 * maps to one PartyKit room: two players who enter the SAME code join the same
 * room and fight each other. The game (game.js) renders server snapshots and
 * sends local inputs.
 *
 * Wire protocol:
 *   client -> { t:"join", name } | { t:"input", seq, input:{left,right,jump,duck,aimAngle,throw} }
 *   server -> { t:"welcome", id, arena } | { t:"state", players, balls, score, events } | { t:"left", id }
 *
 * SERVER_URL is the PartyKit host. The room/party-code is appended as the path
 * /parties/main/<code>. Override the host at runtime with ?server=wss://...
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // PartyKit host (no trailing slash, no path). Set after `npm run deploy`.
  // e.g. "wss://snowball-arena.<your-partykit-username>.partykit.dev"
  const SERVER_URL = "";

  function serverHost() {
    const q = new URLSearchParams(location.search).get("server");
    return (q || SERVER_URL).replace(/\/+$/, "");
  }

  /** Is live online play available (a server host is configured)? */
  function online() {
    return !!serverHost();
  }

  /** Build the WebSocket URL for a given party code (PartyKit room). */
  function roomUrl(code) {
    return serverHost() + "/parties/main/" + encodeURIComponent(code);
  }

  /** Read the logged-in account name so online names match the arcade profile. */
  async function getMe() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.username ? j : null;
    } catch (_) {
      return null;
    }
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

  /** Generate a friendly, easy-to-share code (no ambiguous chars). */
  function randomCode() {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/O/0/1
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  /** Live PvP transport over WebSocket to one PartyKit room (party code). */
  class OnlineConnection {
    constructor(code, name) {
      this.kind = "online";
      this.code = code;
      this.name = name;
      this.handlers = {};
      this.ws = null;
      this.closed = false;
    }
    on(handlers) { this.handlers = handlers || {}; }

    connect() {
      const h = this.handlers;
      h.onStatus && h.onStatus("connecting");
      let ws;
      try {
        ws = new WebSocket(roomUrl(this.code));
      } catch (_) {
        h.onStatus && h.onStatus("error");
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "join", name: this.name }));
        h.onStatus && h.onStatus("live");
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        switch (msg.t) {
          case "welcome": h.onWelcome && h.onWelcome(msg); break;
          case "state":   h.onState && h.onState(msg); break;
          case "full":    h.onFull && h.onFull(msg); break;
          case "left":    h.onLeft && h.onLeft(msg); break;
        }
      };
      ws.onclose = () => { if (!this.closed) h.onStatus && h.onStatus("offline"); };
      ws.onerror = () => { h.onStatus && h.onStatus("error"); };
    }

    sendInput(seq, input) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ t: "input", seq, input }));
      }
    }
    close() {
      this.closed = true;
      if (this.ws) try { this.ws.close(); } catch (_) {}
    }
  }

  window.SnowNet = {
    online, getMe, guestName, cleanCode, randomCode, serverHost,
    connect(code, name) { return new OnlineConnection(cleanCode(code), name); },
  };
})();
