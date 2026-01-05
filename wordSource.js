import { isClean } from "./profanity.js";

const MIN_LEN = 5;
const MAX_LEN = 9;

const SOURCES = [
  "https://random-word-api.herokuapp.com/word?number=1",
  "https://random-word-api.vercel.app/api?words=1"
];

function normalize(word) {
  return word?.toLowerCase().replace(/[^a-z]/g, "");
}

async function fetchWord() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { timeout: 4000 });
      const data = await res.json();
      const raw = Array.isArray(data) ? data[0] : null;
      const word = normalize(raw);

      if (
        word &&
        word.length >= MIN_LEN &&
        word.length <= MAX_LEN &&
        isClean(word)
      ) {
        return word;
      }
    } catch {}
  }
  return null;
}

export async function getSafeEnglishWord() {
  for (let i = 0; i < 6; i++) {
    const w = await fetchWord();
    if (w) return w;
  }
  return "streamer"; // guaranteed fallback
}
