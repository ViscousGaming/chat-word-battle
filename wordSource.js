import { isClean } from "./profanity.js";

const MIN_LEN = 5;
const MAX_LEN = 9;

/**
 * Online random word sources
 */
const SOURCES = [
  "https://random-word-api.herokuapp.com/word?number=1",
  "https://random-word-api.vercel.app/api?words=1"
];

/**
 * Normalize raw API output
 */
function normalize(word) {
  return word?.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Check if a word is commonly used English
 * Uses Datamuse frequency scoring
 */
async function isCommonWord(word) {
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?sp=${word}&md=f&max=1`
    );
    const data = await res.json();

    if (!data || !data[0] || !data[0].tags) return false;

    // Example tag: "f:23.45" → higher = more common
    const freqTag = data[0].tags.find((t) => t.startsWith("f:"));
    if (!freqTag) return false;

    const freq = parseFloat(freqTag.slice(2));

    // 🔥 THRESHOLD — tweakable
    return freq >= 3.5;
  } catch {
    return false;
  }
}

/**
 * Fetch one random word from online sources
 */
async function fetchWord() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      const raw = Array.isArray(data) ? data[0] : null;
      const word = normalize(raw);

      if (
        word &&
        word.length >= MIN_LEN &&
        word.length <= MAX_LEN &&
        isClean(word) &&
        await isCommonWord(word) // ✅ NEW FILTER
      ) {
        return word;
      }
    } catch {}
  }
  return null;
}

/**
 * Public function used by the game
 */
export async function getSafeEnglishWord() {
  for (let i = 0; i < 8; i++) {
    const w = await fetchWord();
    if (w) return w;
  }

  // Guaranteed fallback (simple & safe)
  return "streamer";
}
