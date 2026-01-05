import WebSocket from "ws";

export function startKick(onMessage) {
  const ws = new WebSocket(process.env.KICK_CHAT_WS);

  ws.on("message", raw => {
    const data = JSON.parse(raw);
    if (!data?.sender?.username) return;
    onMessage("kick", data.sender.username, data.content);
  });
}
