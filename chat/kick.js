import WebSocket from "ws";

let kickSocket = null;
let sayCallback = null;

export function startKick(onMessage, onSay) {
  kickSocket = new WebSocket("wss://chat.kick.com");

  kickSocket.on("open", () => {
    kickSocket.send(JSON.stringify({
      event: "join",
      data: { channel: process.env.KICK_CHANNEL }
    }));
  });

  kickSocket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.event !== "chat_message") return;

      const user = msg.data.sender.username;
      const text = msg.data.content;

      onMessage("kick", user, text);
    } catch {}
  });

  // expose say() for server.js
  sayCallback = onSay;
  sayCallback((text) => {
    if (!kickSocket || kickSocket.readyState !== 1) return;

    kickSocket.send(JSON.stringify({
      event: "send_message",
      data: { content: text }
    }));
  });
}
