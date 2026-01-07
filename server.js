import express from "express";
import { WebSocketServer } from "ws";
import { WordGame } from "./game.js";
import { startKick } from "./chat/kick.js";
import { startTwitch } from "./chat/twitch.js";
import { getSafeEnglishWord } from "./wordSource.js";

/* =========================
   CONFIG
========================= */

const ROUND_DURATION = 180000;     // 3 minutes
const AFTER_REVEAL_DELAY = 30000;  // 30s before next word
const MIN_REVEAL_INTERVAL = 30000; // 30s per reveal

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
});

/* =========================
   WORD MEMORY (ANTI REPEAT)
========================= */

const USED_WORDS = new Set();
const MAX_USED_WORDS = 50;

async function getUniqueWord() {
  for (let i = 0; i < 10; i++) {
    const word = await getSafeEnglishWord();
    if (!USED_WORDS.has(word)) {
      USED_WORDS.add(word);

      if (USED_WORDS.size > MAX_USED_WORDS) {
        const first = USED_WORDS.values().next().value;
        USED_WORDS.delete(first);
      }

      return word;
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

let revealTimer = null;
let roundTimeout = null;
let countdownTimer = null;
let firstRevealTimeout = null;
let reminderInterval = null;

/* Leaderboard resets every stream */
const leaderboard = {};

/* Hint state */
let hintUsed = false;
let cachedHint = null;

/* =========================
   CHAT OUTPUT
========================= */

let twitchSay = () => {};

/* =========================
   START CHAT
========================= */

startTwitch((platform, user, msg, say) => {
  twitchSay = say;
  onChat(platform, user, msg);
});

startKick(onChat);

/* =========================
   HELPERS
========================= */

function leaderboardText() {
  const entries = Object.entries(leaderboard)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!entries.length) return "🏆 Leaderboard is empty.";

  return (
    "🏆 Leaderboard: " +
    entries.map((e, i) => `${i + 1}) ${e[0]}(${e[1]})`).join(" ")
  );
}

async function fetchDefinition(word) {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
    );
    const data = await res.json();
    return data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || null;
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

  /* First reveal after 10s */
  firstRevealTimeout = setTimeout(() => {
    game.revealRandom();
    currentWordText = game.masked();
    send("word", { value: currentWordText });
  }, 10000);

  const hiddenLetters = game.word.length - 2;
  const interval =
    Math.max(ROUND_DURATION / hiddenLetters, MIN_REVEAL_INTERVAL);

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

    let seconds = AFTER_REVEAL_DELAY / 1000;
    send("countdown", { seconds });

    countdownTimer = setInterval(() => {
      seconds--;
      send("countdown", { seconds });

      if (seconds <= 0) {
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

    twitchSay("🎮 Word game started! Type !guess <word>");

    clearInterval(reminderInterval);
    reminderInterval = setInterval(() => {
      if (!WORD_ACTIVE) return;
      twitchSay(
        "🎮 Commands: !guess <word> | !hint | !myscore | !gamelb"
      );
    }, 300000);

    return;
  }

  if (msg === "!endword" && isOwner) {
    WORD_ACTIVE = false;

    clearInterval(revealTimer);
    clearTimeout(roundTimeout);
    clearTimeout(firstRevealTimeout);
    clearInterval(countdownTimer);
    clearInterval(reminderInterval);

    currentWordText = "WORD GAME ENDED";
    send("word", { value: currentWordText });

    twitchSay("🛑 Word game ended.");
    return;
  }

  if (msg === "!gamelb") {
    twitchSay(leaderboardText());
    return;
  }

  if (msg === "!myscore") {
    twitchSay(`📊 ${user}, your score is ${leaderboard[user] || 0}`);
    return;
  }

  if (msg === "!hint") {
    if (!WORD_ACTIVE) return twitchSay("❌ No active word.");
    if (hintUsed) return twitchSay("⛔ Hint already used!");

    hintUsed = true;
    cachedHint ??= await fetchDefinition(game.word);

    twitchSay(
      cachedHint ? `💡 Hint: ${cachedHint}` : "💡 No definition found."
    );
    return;
  }

  if (!WORD_ACTIVE || !msg.startsWith("!guess ")) return;

  const guess = msg.split(" ")[1];
  if (!guess) return;

  if (game.check(guess)) {
    leaderboard[user] = (leaderboard[user] || 0) + 1;
    twitchSay(`🎉 ${user} guessed the word correctly!`);
    startRound.endRound(user);
  }
}
