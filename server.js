import express from "express";
import { WebSocketServer } from "ws";
import { WordGame } from "./game.js";
import { startKick } from "./chat/kick.js";
import { startTwitch } from "./chat/twitch.js";

const app = express();
app.use(express.static("public"));

const server = app.listen(process.env.PORT || 3000);
const wss = new WebSocketServer({ server });

let overlaySocket = null;

wss.on("connection", ws => {
  overlaySocket = ws;
});

function send(type, payload = {}) {
  if (overlaySocket) {
    overlaySocket.send(JSON.stringify({ type, ...payload }));
  }
}

const game = new WordGame();
const score = { kick: 0, twitch: 0 };

let WORD_ACTIVE = false;
let KVT_ACTIVE = false;
let revealTimer;

async function startRound() {
  await game.start();
  send("word", { value: game.masked() });

  clearInterval(revealTimer);
  revealTimer = setInterval(() => {
    game.revealRandom();
    send("word", { value: game.masked() });
  }, 5000);
}

function onChat(platform, user, msg) {
  const isOwner = user === process.env.OWNER_NAME;

  if (msg === "!word" && isOwner) {
    WORD_ACTIVE = true;
    startRound();
    return;
  }

  if (msg === "!endword" && isOwner) {
    WORD_ACTIVE = false;
    KVT_ACTIVE = false;
    clearInterval(revealTimer);
    send("word", { value: "WORD GAME ENDED" });
    return;
  }

  if (msg === "!kvt" && isOwner) {
    KVT_ACTIVE = true;
    score.kick = 0;
    score.twitch = 0;
    send("battle", score);
    return;
  }

  if (!WORD_ACTIVE) return;
  if (!msg.startsWith("!guess ")) return;

  const guess = msg.split(" ")[1];
  if (!guess) return;

  if (game.check(guess)) {
    clearInterval(revealTimer);
    send("word", { value: game.word });

    if (KVT_ACTIVE) {
      score[platform]++;
      send("battle", score);
    }

    setTimeout(startRound, 3000);
  }
}

startKick(onChat);
startTwitch(onChat);

send("word", { value: "WAITING FOR !WORD" });
