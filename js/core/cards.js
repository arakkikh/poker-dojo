// カードは 0〜51 の整数で表す。 card = rank * 4 + suit
// rank: 0=2, 1=3, ... 8=T, 9=J, 10=Q, 11=K, 12=A
// suit: 0=♠ 1=♥ 2=♦ 3=♣

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_NAMES_JA = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const makeCard = (rank, suit) => rank * 4 + suit;

/** "As" "Td" "10h" などの文字列をカードに変換 */
export function parseCard(str) {
  const s = str.trim();
  const suitCh = s.slice(-1).toLowerCase();
  let rankStr = s.slice(0, -1).toUpperCase();
  if (rankStr === '10') rankStr = 'T';
  const rank = RANK_CHARS.indexOf(rankStr);
  const suit = SUIT_CHARS.indexOf(suitCh);
  if (rank < 0 || suit < 0 || rankStr.length !== 1) throw new Error(`不正なカード: ${str}`);
  return makeCard(rank, suit);
}

/** "As Kd 7c" のような空白区切りをカード配列に */
export function parseCards(str) {
  return str.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export const cardToString = (c) => RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
export const cardLabel = (c) => RANK_LABELS[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

export function fullDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** シード付き乱数（テストや再現用）。mulberry32 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates シャッフル（配列をその場で並べ替えて返す） */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffledDeck(rng = Math.random) {
  return shuffle(fullDeck(), rng);
}
