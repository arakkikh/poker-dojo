// 役判定。5〜7枚のカードから最も強い5枚の役を求める。
// スコアは大きいほど強い数値: カテゴリ * 2^20 + キッカー（4bit × 5枠）

import { rankOf, suitOf, RANK_NAMES_JA } from './cards.js';

export const HIGH_CARD = 0;
export const ONE_PAIR = 1;
export const TWO_PAIR = 2;
export const THREE_OF_A_KIND = 3;
export const STRAIGHT = 4;
export const FLUSH = 5;
export const FULL_HOUSE = 6;
export const FOUR_OF_A_KIND = 7;
export const STRAIGHT_FLUSH = 8;
export const ROYAL_FLUSH = 9;

export const CATEGORY_NAMES = [
  'ハイカード',
  'ワンペア',
  'ツーペア',
  'スリーカード',
  'ストレート',
  'フラッシュ',
  'フルハウス',
  'フォーカード',
  'ストレートフラッシュ',
  'ロイヤルフラッシュ',
];

const CATEGORY_UNIT = 1 << 20;

/** キッカーのランク配列（強い順・最大5個）を左詰めで20bitに詰める */
function pack(ranks) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 16 + (i < ranks.length ? ranks[i] : 0);
  return v;
}

/** ランクのビットマスクからストレートの最高ランクを返す（無ければ -1）。A-2-3-4-5 は 3（=5ハイ） */
export function straightHigh(mask) {
  for (let high = 12; high >= 4; high--) {
    const m = 0x1f << (high - 4);
    if ((mask & m) === m) return high;
  }
  if ((mask & 0x100f) === 0x100f) return 3;
  return -1;
}

/** マスク内の上位 n 個のランクを強い順に返す（exclude のランクは除く） */
function topRanks(mask, n, exclude = -1, exclude2 = -1) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (r !== exclude && r !== exclude2 && (mask & (1 << r))) out.push(r);
  }
  return out;
}

const counts = new Int8Array(13);
const suitMasks = new Int32Array(4);
const suitCounts = new Int8Array(4);

/**
 * 5〜7枚のカードの強さを数値で返す（高速版。勝率計算などで大量に呼ぶ用）
 */
export function scoreHand(cards) {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i] >> 2;
    const s = cards[i] & 3;
    counts[r]++;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sh = straightHigh(suitMasks[flushSuit]);
    if (sh >= 0) return (sh === 12 ? ROYAL_FLUSH : STRAIGHT_FLUSH) * CATEGORY_UNIT + pack([sh]);
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  let pair3 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = counts[r];
    if (c === 4) {
      if (quad < 0) quad = r;
    } else if (c === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (c === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
      else if (pair3 < 0) pair3 = r;
    }
  }

  if (quad >= 0) {
    return FOUR_OF_A_KIND * CATEGORY_UNIT + pack([quad, ...topRanks(rankMask, 1, quad)]);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    return FULL_HOUSE * CATEGORY_UNIT + pack([trip1, Math.max(trip2, pair1)]);
  }
  if (flushSuit >= 0) {
    return FLUSH * CATEGORY_UNIT + pack(topRanks(suitMasks[flushSuit], 5));
  }
  const sh = straightHigh(rankMask);
  if (sh >= 0) return STRAIGHT * CATEGORY_UNIT + pack([sh]);
  if (trip1 >= 0) {
    return THREE_OF_A_KIND * CATEGORY_UNIT + pack([trip1, ...topRanks(rankMask, 2, trip1)]);
  }
  if (pair2 >= 0) {
    return TWO_PAIR * CATEGORY_UNIT + pack([pair1, pair2, ...topRanks(rankMask, 1, pair1, pair2)]);
  }
  if (pair1 >= 0) {
    return ONE_PAIR * CATEGORY_UNIT + pack([pair1, ...topRanks(rankMask, 3, pair1)]);
  }
  return HIGH_CARD * CATEGORY_UNIT + pack(topRanks(rankMask, 5));
}

export const categoryOf = (score) => Math.floor(score / CATEGORY_UNIT);

/** スコアからキッカー部分のランク配列（5枠）を取り出す */
function unpack(score) {
  let v = score % CATEGORY_UNIT;
  const out = [];
  for (let i = 0; i < 5; i++) {
    out.unshift(v % 16);
    v = Math.floor(v / 16);
  }
  return out;
}

/** スコアを日本語の説明にする（例:「Aのワンペア」「KとJのツーペア」） */
export function describeScore(score) {
  const cat = categoryOf(score);
  const k = unpack(score).map((r) => RANK_NAMES_JA[r]);
  switch (cat) {
    case ROYAL_FLUSH:
      return 'ロイヤルフラッシュ';
    case STRAIGHT_FLUSH:
      return `${k[0]}ハイのストレートフラッシュ`;
    case FOUR_OF_A_KIND:
      return `${k[0]}のフォーカード`;
    case FULL_HOUSE:
      return `${k[0]}と${k[1]}のフルハウス`;
    case FLUSH:
      return `${k[0]}ハイのフラッシュ`;
    case STRAIGHT:
      return `${k[0]}ハイのストレート`;
    case THREE_OF_A_KIND:
      return `${k[0]}のスリーカード`;
    case TWO_PAIR:
      return `${k[0]}と${k[1]}のツーペア`;
    case ONE_PAIR:
      return `${k[0]}のワンペア`;
    default:
      return `${k[0]}ハイ（役なし）`;
  }
}

function* combinations(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) {
    yield prefix;
    return;
  }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) {
    yield* combinations(arr, k, i + 1, [...prefix, arr[i]]);
  }
}

/** 役を構成する5枚を見やすい順（役の部分→キッカー、ランク降順）に並べる */
function orderBest(cards, score) {
  const cat = categoryOf(score);
  const cnt = {};
  for (const c of cards) cnt[rankOf(c)] = (cnt[rankOf(c)] || 0) + 1;
  const wheel = (cat === STRAIGHT || cat === STRAIGHT_FLUSH) && unpack(score)[0] === 3;
  const rankKey = (c) => (wheel && rankOf(c) === 12 ? -1 : rankOf(c));
  return [...cards].sort(
    (a, b) => cnt[rankOf(b)] - cnt[rankOf(a)] || rankKey(b) - rankKey(a) || suitOf(a) - suitOf(b),
  );
}

/**
 * 詳細版の役判定。UI表示や解説に使う。
 * @returns {{score:number, category:number, name:string, description:string, best:number[]}}
 */
export function evaluateHand(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error('役判定には5〜7枚のカードが必要です');
  let bestScore = -1;
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const s = scoreHand(combo);
    if (s > bestScore) {
      bestScore = s;
      best = combo;
    }
  }
  const category = categoryOf(bestScore);
  return {
    score: bestScore,
    category,
    name: CATEGORY_NAMES[category],
    description: describeScore(bestScore),
    best: orderBest(best, bestScore),
  };
}

/** 2つの手を比較: a が強ければ正、b が強ければ負、引き分けは 0 */
export function compareHands(a, b) {
  return scoreHand(a) - scoreHand(b);
}
