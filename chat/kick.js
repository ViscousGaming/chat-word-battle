import WebSocket from "ws";

export function startKick(onMessage, onSay) {
  let ws = null;

  try {
    ws = new WebSocket("wss://chat.kick.com");

    ws.on("open", () => {
      console.log("🟢 Kick chat connected");
      ws.send(JSON.stringify({
        event: "join",
        data: { channel: process.env.KICK_CHANNEL }
      }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg?.event !== "chat_message") return;

        onMessage("kick", msg.data.sender.username, msg.data.content);
      } catch {}
    });

    ws.on("error", (err) => {
      console.warn("⚠️ Kick chat error (ignored):", err.message);
    });

    ws.on("close", () => {
      console.warn("⚠️ Kick chat closed (ignored)");
    });

    onSay((text) => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          event: "send_message",
          data: { content: text }
        }));
      }
    });

  } catch (err) {
    console.warn("⚠️ Kick chat disabled:", err.message);
  }
}
