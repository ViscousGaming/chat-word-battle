import express from "express";
import { WebSocketServer } from "ws";
import { WordGame } from "./game.js";
import { startKick } from "./chat/kick.js";
import { startTwitch } from "./chat/twitch.js";

/* =========================
   CONFIG
========================= */

const ROUND_DURATION = 180000;      // 3 minutes
const AFTER_REVEAL_DELAY = 30000;   // 30s before next word
const MIN_REVEAL_INTERVAL = 20000;  // min 20s between reveals

/* =========================
   APP + SERVER
========================= */

const app = express();
app.use(express.static("public"));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

/* =========================
   WEBSOCKET
========================= */

let overlaySocket = null;

function send(type, payload = {}) {
  if (!overlaySocket) return;
  overlaySocket.send(JSON.stringify({ type, ...payload }));
}

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  overlaySocket = ws;
  send("word", { value: currentWordText });
  send("leaderboard", getLeaderboard());
});

/* =========================
   GAME STATE
========================= */

const game = new WordGame();
let currentWordText = "WAITING FOR !WORD";
let WORD_ACTIVE = false;

let revealTimer = null;
let roundTimeout = null;
let countdownTimer = null;

/* 🏆 LEADERBOARD */
const leaderboard = {}; // { username: score }

/* =========================
   CHAT OUTPUT
========================= */

let twitchSay = () => {};

/* =========================
   START CHAT CLIENTS
========================= */

startTwitch((platform, user, msg, say) => {
  twitchSay = say;
  onChat(platform, user, msg);
});

startKick(onChat);

/* =========================
   HELPERS
========================= */

function getLeaderboard() {
  return Object.entries(leaderboard)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, score]) => ({ name, score }));
}

function leaderboardText() {
  const top = getLeaderboard();
  if (top.length === 0) return "🏆 Leaderboard is empty.";

  return (
    "🏆 Game Leaderboard: " +
    top.map((u, i) => `${i + 1}) ${u.name}(${u.score})`).join(" ")
  );
}

/* =========================
   GAME LOGIC
========================= */

async function startRound() {
  await game.start();

  clearInterval(revealTimer);
  clearTimeout(roundTimeout);
  clearInterval(countdownTimer);

  currentWordText = game.masked();
  send("word", { value: currentWordText });
  send("winner", { name: "" });
  send("countdown", { seconds: 0 });

  const totalLetters = game.word.length;
  const hiddenLetters = totalLetters - 2;

  const calculatedInterval =
    hiddenLetters > 0 ? ROUND_DURATION / hiddenLetters : ROUND_DURATION;

  const revealInterval = Math.max(calculatedInterval, MIN_REVEAL_INTERVAL);

  let roundEnded = false;

  revealTimer = setInterval(() => {
    if (roundEnded) return;

    game.revealRandom();
    currentWordText = game.masked();
    send("word", { value: currentWordText });

    if (!currentWordText.includes("_")) {
      endRound(null);
    }
  }, revealInterval);

  roundTimeout = setTimeout(() => {
    if (!roundEnded) {
      endRound(null);
    }
  }, ROUND_DURATION);

  function endRound(winner) {
    if (roundEnded) return;
    roundEnded = true;

    clearInterval(revealTimer);
    clearTimeout(roundTimeout);

    currentWordText = game.word;
    send("word", { value: currentWordText });

    if (winner) {
      send("winner", { name: winner });
    }

    let remaining = 30;
    send("countdown", { seconds: remaining });

    countdownTimer = setInterval(() => {
      remaining--;
      send("countdown", { seconds: remaining });

      if (remaining <= 0) {
        clearInterval(countdownTimer);
        if (WORD_ACTIVE) startRound();
      }
    }, 1000);
  }

  startRound.endRound = endRound;
}

/* =========================
   CHAT HANDLER
========================= */

function onChat(platform, user, msg) {
  const isOwner = user === process.env.OWNER_NAME;

  if (msg === "!word" && isOwner) {
    WORD_ACTIVE = true;
    startRound();
    twitchSay("🎮 Word game started! Type !guess <word>");
    return;
  }

  if (msg === "!endword" && isOwner) {
    WORD_ACTIVE = false;

    clearInterval(revealTimer);
    clearTimeout(roundTimeout);
    clearInterval(countdownTimer);

    currentWordText = "WORD GAME ENDED";
    send("word", { value: currentWordText });
    send("winner", { name: "" });
    send("countdown", { seconds: 0 });

    twitchSay("🛑 Word game ended.");
    return;
  }

  /* 🔥 RENAMED COMMAND */
  if (msg === "!gamelb") {
    twitchSay(leaderboardText());
    return;
  }

  if (!WORD_ACTIVE) return;
  if (!msg.startsWith("!guess ")) return;

  const guess = msg.split(" ")[1];
  if (!guess) return;

  if (game.check(guess)) {
    leaderboard[user] = (leaderboard[user] || 0) + 1;

    send("leaderboard", getLeaderboard());
    send("win");

    twitchSay(`🎉 ${user} guessed the word correctly!`);

    startRound.endRound(user);
  }
}
