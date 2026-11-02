// A local PeerJS signalling broker (what 0.peerjs.com is in production). The p2p games (snowball-arena, net-rally, ragdoll-siege)
// find each other through it, then talk directly browser-to-browser over WebRTC.
const { PeerServer } = require("peer");
const port = Number(process.env.PORT || 9000);
PeerServer({ port, path: "/", key: "peerjs", allow_discovery: true, proxied: false });
console.log("peerjs broker on", port);
