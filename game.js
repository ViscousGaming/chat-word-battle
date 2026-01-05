import { getSafeEnglishWord } from "./wordSource.js";

export class WordGame {
  async start() {
    this.word = (await getSafeEnglishWord()).toUpperCase();
    this.revealed = Array(this.word.length).fill("_");
    this.revealed[0] = this.word[0];
    this.revealed[this.word.length - 1] = this.word[this.word.length - 1];
  }

  revealRandom() {
    const hidden = this.revealed
      .map((c, i) => (c === "_" ? i : null))
      .filter(i => i !== null);

    if (!hidden.length) return;
    const index = hidden[Math.floor(Math.random() * hidden.length)];
    this.revealed[index] = this.word[index];
  }

  masked() {
    return this.revealed.join(" ");
  }

  check(guess) {
    return guess.toUpperCase() === this.word;
  }
}
