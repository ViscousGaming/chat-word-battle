import express from "express";
import { WebSocketServer } from "ws";
import { WordGame } from "./game.js";
import { startKick } from "./chat/kick.js";
import { startTwitch } from "./chat/twitch.js";

process.on("unhandledRejection", err => console.error(err));
process.on("uncaughtException", err => console.error(err));

const app = express();
app.use(express.static("public"));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

/* =========================
   WEBSOCKET SERVER
========================= */

let overlaySocket = null;

/* 🔴 DEFINE send() FIRST */
function send(type, payload = {}) {
  if (!overlaySocket) return;
  overlaySocket.send(JSON.stringify({ type, ...payload }));
}

/* 🔴 THEN CREATE WS SERVER */
const wss = new WebSocketServer({ server, path: "/ws" });

/* 🔴 HANDLE CONNECTION */
wss.on("connection", ws => {
  console.log("OVERLAY CONNECTED");
  overlaySocket = ws;

  // Send initial state
  send("word", { value: "WAITING FOR !WORD" });

  ws.on("close", () => {
    console.log("OVERLAY DISCONNECTED");
    overlaySocket = null;
  });
});

/* =========================
   GAME LOGIC
========================= */

const game = new WordGame();
const score = { twitch: 0, kick: 0 };

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
  console.log("CHAT:", platform, user, msg);

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
    score.twitch = 0;
    score.kick = 0;
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

/* =========================
   START CHAT
========================= */

startKick(onChat);
startTwitch(onChat);
