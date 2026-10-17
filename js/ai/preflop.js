// スターティングハンド（最初の2枚）の評価

import { rankOf, suitOf, RANK_CHARS } from '../core/cards.js';

/** "AKs" "72o" "QQ" のような表記 */
export function handNotation(c1, c2) {
  let hi = rankOf(c1);
  let lo = rankOf(c2);
  if (lo > hi) [hi, lo] = [lo, hi];
  if (hi === lo) return RANK_CHARS[hi] + RANK_CHARS[lo];
  return RANK_CHARS[hi] + RANK_CHARS[lo] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

/** 初心者向けの表記（例:「A-K 同じマーク」「10-7 マーク違い」「Qのペア」） */
export function handLabelJa(c1, c2) {
  let hi = rankOf(c1);
  let lo = rankOf(c2);
  if (lo > hi) [hi, lo] = [lo, hi];
  const name = (r) => (r === 8 ? '10' : RANK_CHARS[r]);
  if (hi === lo) return `${name(hi)}のペア`;
  return `${name(hi)}-${name(lo)} ${suitOf(c1) === suitOf(c2) ? '同じマーク' : 'マーク違い'}`;
}

const HIGH_POINTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10]; // 2..A

/**
 * チェン・フォーミュラ（Bill Chen 考案の簡易採点）。-1〜20 点。
 * 目安: 12以上=とても強い、9〜11=強い、7〜8=まあまあ、6以下=弱い
 */
export function chenScore(c1, c2) {
  let hi = rankOf(c1);
  let lo = rankOf(c2);
  if (lo > hi) [hi, lo] = [lo, hi];
  let score = HIGH_POINTS[hi];
  if (hi === lo) {
    score = Math.max(score * 2, 5);
    return Math.ceil(score);
  }
  if (suitOf(c1) === suitOf(c2)) score += 2;
  const gap = hi - lo - 1;
  score -= [0, 1, 2, 4][gap] ?? 5;
  if (gap <= 1 && hi < 10) score += 1; // 両方Q未満のつながった手
  return Math.ceil(score);
}

/** 初心者向けの5段階評価 */
export function handTier(c1, c2) {
  const s = chenScore(c1, c2);
  if (s >= 12) return { tier: 1, label: 'プレミアム', note: 'とても強い手。積極的にレイズしよう' };
  if (s >= 9) return { tier: 2, label: '強い', note: '多くの場面で参加してよい手' };
  if (s >= 7) return { tier: 3, label: 'まあまあ', note: 'ポジションが良ければ参加できる手' };
  if (s >= 5) return { tier: 4, label: '弱め', note: '安く参加できるときだけ' };
  return { tier: 5, label: '弱い', note: '基本はフォールドしたい手' };
}
