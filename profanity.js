import Filter from "bad-words";

const filter = new Filter();

export function isClean(word) {
  return !filter.isProfane(word);
}
