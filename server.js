import express from "express";
import { WebSocketServer } from "ws";
import { WordGame } from "./game.js";
import { startKick } from "./chat/kick.js";
import { startTwitch } from "./chat/twitch.js";
import { getSafeEnglishWord } from "./wordSource.js";

/* =========================
   CONFIG
========================= */

const ROUND_DURATION = 180000;
const AFTER_REVEAL_DELAY = 30000;
const MIN_REVEAL_INTERVAL = 30000;

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
  if (overlaySocket) {
    overlaySocket.send(JSON.stringify({ type, ...payload }));
  }
}

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  overlaySocket = ws;
  send("word", { value: currentWordText });
});

/* =========================
   WORD MEMORY (NO REPEATS)
========================= */

const USED_WORDS = new Set();
const MAX_USED_WORDS = 50;

async function getUniqueWord() {
  for (let i = 0; i < 10; i++) {
    const w = await getSafeEnglishWord();
    if (!USED_WORDS.has(w)) {
      USED_WORDS.add(w);
      if (USED_WORDS.size > MAX_USED_WORDS) {
        USED_WORDS.delete(USED_WORDS.values().next().value);
      }
      return w;
    }
  }
  return getSafeEnglishWord();
}

/* =========================
   GAME STATE
========================= */

const game = new WordGame(getUniqueWord);

let currentWordText = "LOADING WORD";
let WORD_ACTIVE = false;
let KVT_ACTIVE = false;

let revealTimer = null;
let roundTimeout = null;
let countdownTimer = null;
let firstRevealTimeout = null;
let reminderInterval = null;

const leaderboard = {};
const platformScore = { twitch: 0, kick: 0 };

let hintUsed = false;
let cachedHint = null;

/* =========================
   CHAT OUTPUT
========================= */

let twitchSay = () => {};
let kickSay = () => {};

function sayAll(msg) {
  twitchSay(msg);
  kickSay(msg);
}

/* =========================
   START CHAT
========================= */

startTwitch((platform, user, msg, say) => {
  twitchSay = say;
  onChat(platform, user, msg);
});

startKick(onChat, (say) => {
  kickSay = say;
});

/* =========================
   HELPERS
========================= */

function leaderboardText() {
  const list = Object.entries(leaderboard)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!list.length) return "🏆 Leaderboard is empty.";
  return "🏆 Leaderboard: " +
    list.map((e, i) => `${i + 1}) ${e[0]}(${e[1]})`).join(" ");
}

async function fetchDefinition(word) {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    const d = await r.json();
    return d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || null;
  } catch {
    return null;
  }
}

/* =========================
   GAME LOGIC
========================= */

async function startRound() {
  await game.start();

  clearInterval(revealTimer);
  clearTimeout(roundTimeout);
  clearTimeout(firstRevealTimeout);
  clearInterval(countdownTimer);

  hintUsed = false;
  cachedHint = null;

  currentWordText = game.masked();
  send("word", { value: currentWordText });

  firstRevealTimeout = setTimeout(() => {
    game.revealRandom();
    currentWordText = game.masked();
    send("word", { value: currentWordText });
  }, 10000);

  const hidden = game.word.length - 2;
  const interval = Math.max(ROUND_DURATION / hidden, MIN_REVEAL_INTERVAL);

  let ended = false;

  revealTimer = setInterval(() => {
    if (ended) return;
    game.revealRandom();
    currentWordText = game.masked();
    send("word", { value: currentWordText });
    if (!currentWordText.includes("_")) endRound(null);
  }, interval);

  roundTimeout = setTimeout(() => {
    if (!ended) endRound(null);
  }, ROUND_DURATION);

  function endRound(winner) {
    if (ended) return;
    ended = true;

    clearInterval(revealTimer);
    clearTimeout(roundTimeout);
    clearTimeout(firstRevealTimeout);

    currentWordText = game.word;
    send("word", { value: currentWordText });

    if (winner) send("winner", { name: winner });

    let s = AFTER_REVEAL_DELAY / 1000;
    send("countdown", { seconds: s });

    countdownTimer = setInterval(() => {
      s--;
      send("countdown", { seconds: s });
      if (s <= 0) {
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

async function onChat(platform, user, msg) {
  const isOwner = user === process.env.OWNER_NAME;

  if (msg === "!word" && isOwner) {
    WORD_ACTIVE = true;
    startRound();
    sayAll("🎮 Word game started! Type !guess <word>");

    clearInterval(reminderInterval);
    reminderInterval = setInterval(() => {
      if (WORD_ACTIVE) {
        sayAll("🎮 Commands: !guess <word> | !hint | !myscore | !gamelb | !kvt");
      }
    }, 300000);
    return;
  }

  if (msg === "!kvt" && isOwner) {
    KVT_ACTIVE = true;
    WORD_ACTIVE = true;
    startRound();
    sayAll("⚔️ Kick vs Twitch started! First correct guess wins!");
    return;
  }

  if (msg === "!kvtscore") {
    sayAll(`⚔️ Kick ${platformScore.kick} | Twitch ${platformScore.twitch}`);
    return;
  }

  if (msg === "!endkvt" && isOwner) {
    KVT_ACTIVE = false;
    sayAll("🛑 Kick vs Twitch ended.");
    return;
  }

  if (msg === "!endword" && isOwner) {
    WORD_ACTIVE = false;
    clearInterval(reminderInterval);
    currentWordText = "WORD GAME ENDED";
    send("word", { value: currentWordText });
    sayAll("🛑 Word game ended.");
    return;
  }

  if (msg === "!gamelb") return sayAll(leaderboardText());
  if (msg === "!myscore") return sayAll(`📊 ${user}, your score is ${leaderboard[user] || 0}`);

  if (msg === "!hint") {
    if (!WORD_ACTIVE) return sayAll("❌ No active word.");
    if (hintUsed) return sayAll("⛔ Hint already used!");
    hintUsed = true;
    cachedHint ??= await fetchDefinition(game.word);
    return sayAll(cachedHint ? `💡 Hint: ${cachedHint}` : "💡 No definition found.");
  }

  if (!WORD_ACTIVE || !msg.startsWith("!guess ")) return;

  const guess = msg.split(" ")[1];
  if (game.check(guess)) {
    leaderboard[user] = (leaderboard[user] || 0) + 1;

    if (KVT_ACTIVE) {
      platformScore[platform]++;
      sayAll(`🏆 ${platform.toUpperCase()} wins! (${user})`);
    } else {
      sayAll(`🎉 ${user} guessed the word correctly!`);
    }

    startRound.endRound(user);
  }
}
