import tmi from "tmi.js";

export function startTwitch(onMessage) {
  const client = new tmi.Client({
    identity: {
      username: process.env.TWITCH_BOT_NAME,
      password: process.env.TWITCH_OAUTH
    },
    channels: [process.env.TWITCH_CHANNEL]
  });

  client.connect();

  // 🔊 expose say() to server
  const say = (msg) => {
    client.say(process.env.TWITCH_CHANNEL, msg);
  };

  client.on("message", (_, tags, message, self) => {
    if (self) return;

    onMessage("twitch", tags.username, message, say);
  });
}
