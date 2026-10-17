// ミッション（目標）の定義。
// check(ctx, data) は出来事 ctx が起きたときに達成したかを返す。
// ctx.type: 'hand'（ハンド終了）| 'lesson'（章クリア）| 'drill'（ドリル終了）| 'tournament'（トーナメント終了）
// data は保存データ（storage.js）

import { FLUSH, FULL_HOUSE, FOUR_OF_A_KIND, STRAIGHT, HIGH_CARD, evaluateHand } from '../core/evaluator.js';
import { LESSONS } from './lessons.js';

const hand = (fn) => (ctx) => ctx.type === 'hand' && fn(ctx.summary);

export const MISSIONS = [
  // --- はじめの一歩 ---
  { id: 'first-lesson', icon: '📘', title: 'はじめの一歩', desc: '入門レッスンを1章クリアする', reward: 30, check: (ctx) => ctx.type === 'lesson' },
  { id: 'first-win', icon: '🪙', title: 'はじめてのポット', desc: '対戦でポットを1回獲得する', reward: 50, check: hand((s) => s.won) },
  { id: 'showdown-win', icon: '🃏', title: '勝負に勝つ', desc: 'ショーダウン（手札の見せ合い）で勝つ', reward: 50, check: hand((s) => s.showdownWon) },
  // --- 役を作る ---
  { id: 'make-straight', icon: '📏', title: 'つながった！', desc: 'ストレートを完成させる', reward: 60, check: hand((s) => s.category === STRAIGHT) },
  { id: 'make-flush', icon: '♥️', title: 'そろった！', desc: 'フラッシュを完成させる', reward: 80, check: hand((s) => s.category === FLUSH) },
  { id: 'make-fullhouse', icon: '🏠', title: '満員御礼', desc: 'フルハウスを完成させる', reward: 120, check: hand((s) => s.category === FULL_HOUSE) },
  { id: 'make-quads', icon: '🍀', title: '4枚そろい', desc: 'フォーカード以上を完成させる', reward: 300, check: hand((s) => s.category != null && s.category >= FOUR_OF_A_KIND) },
  // --- テクニック ---
  { id: 'allin-win', icon: '🔥', title: 'オールインで勝つ', desc: 'オールインして、ショーダウンで勝つ', reward: 100, check: hand((s) => s.allIn && s.showdownWon) },
  {
    id: 'bluff',
    icon: '🎭',
    title: 'ブラフ成功',
    desc: 'フロップ以降、役なしの状態でベット/レイズして全員を降ろす',
    reward: 150,
    check: hand((s) => s.bluffWin),
  },
  { id: 'kicker', icon: '🦶', title: 'キッカー勝ち', desc: '同じ役の相手に、残りのカードの差で勝つ', reward: 60, check: hand((s) => s.kickerWin) },
  { id: 'big-pot', icon: '💰', title: '大きなポット', desc: '1回で2,000チップ以上のポットを獲得する', reward: 120, check: hand((s) => s.potWon >= 2000) },
  {
    id: 'tight',
    icon: '🧘',
    title: '我慢の達人',
    desc: '1回の対戦で20ハンド以上プレイし、参加率を30%以下に抑えてプラスで終える',
    reward: 120,
    check: hand((s) => s.session.hands >= 20 && s.session.vpip / s.session.hands <= 0.3 && s.session.net > 0),
  },
  {
    id: 'beat-advanced',
    icon: '🎓',
    title: '上級者を倒す',
    desc: '上級CPUとのショーダウンで勝つ',
    reward: 120,
    check: hand((s) => s.showdownWon && s.beatLevels.includes('advanced')),
  },
  {
    id: 'good-decisions',
    icon: '💡',
    title: 'お手本どおり',
    desc: 'ヒント付き対戦で、3回以上判断したハンドをすべて「良い判断」で終える',
    reward: 80,
    check: hand((s) => s.decisions >= 3 && s.goodDecisions === s.decisions),
  },
  // --- 学習 ---
  {
    id: 'all-lessons',
    icon: '🎖️',
    title: '入門卒業',
    desc: '入門レッスンを全章クリアする',
    reward: 200,
    check: (ctx, data) => ctx.type === 'lesson' && LESSONS.every((l) => data.progress.lessons[l.id]?.done),
  },
  { id: 'drill-perfect', icon: '💯', title: 'パーフェクト', desc: 'どれかのドリルで10問全問正解する', reward: 100, check: (ctx) => ctx.type === 'drill' && ctx.score === ctx.total },
  // --- トーナメント ---
  { id: 'tourney-itm', icon: '🥉', title: '入賞', desc: 'トーナメントで3位以内に入る', reward: 100, check: (ctx) => ctx.type === 'tournament' && ctx.place <= 3 },
  { id: 'tourney-win', icon: '🏆', title: 'チャンピオン', desc: 'トーナメントで優勝する', reward: 300, check: (ctx) => ctx.type === 'tournament' && ctx.place === 1 },
];

// コインと交換できるカードの裏デザイン
export const CARD_BACKS = [
  { id: 'red', label: 'クラシック赤', price: 0 },
  { id: 'blue', label: 'ロイヤル青', price: 100 },
  { id: 'green', label: 'エメラルド', price: 200 },
  { id: 'purple', label: 'ミッドナイト', price: 300 },
  { id: 'gold', label: 'ゴールド', price: 500 },
];

/**
 * 終わったハンドから、ミッション判定に使う情報をまとめる
 * @param {import('../core/game.js').Hand} hand
 * @param {string} meId
 * @param {object} [o]
 * @param {(id:string) => string|null} [o.levelOf] プレイヤーIDからCPUの強さ
 * @param {{verdict:{mark:string}}[]} [o.decisions] ヒント付き対戦の判断記録
 * @param {{hands:number, vpip:number, net:number}} [o.session] この対戦の累計（このハンドを含む）
 */
export function buildHandSummary(hand, meId, { levelOf = () => null, decisions = [], session = { hands: 0, vpip: 0, net: 0 } } = {}) {
  const me = hand.playerById(meId);
  const res = hand.results;
  const potWon = me.stack - me.startStack + me.totalBet;
  const won = potWon > 0;
  const mine = hand.events.filter((e) => e.type === 'action' && e.playerId === meId);
  const sd = hand.events.find((e) => e.type === 'showdown');
  const mySd = sd && sd.hands.find((h) => h.playerId === meId);
  const showdownWon = !!mySd && won;
  const split = res.pots.some((p) => p.winners.includes(meId) && p.winners.length > 1);
  const category = !me.folded && hand.board.length === 5 ? evaluateHand([...me.hole, ...hand.board]).category : null;

  const last = mine[mine.length - 1];
  const bluffWin =
    res.uncontested &&
    won &&
    hand.board.length >= 3 &&
    !!last &&
    last.isRaise &&
    last.street !== 'preflop' &&
    evaluateHand([...me.hole, ...hand.board]).category === HIGH_CARD;

  const others = mySd ? sd.hands.filter((h) => h.playerId !== meId) : [];
  const kickerWin = showdownWon && !split && others.some((h) => h.eval.description === mySd.eval.description);
  const beatLevels = showdownWon ? others.filter((h) => h.eval.score < mySd.eval.score).map((h) => levelOf(h.playerId)) : [];

  return {
    won,
    net: res.net[meId],
    potWon: won ? potWon : 0,
    showdown: !!mySd,
    showdownWon,
    allIn: mine.some((e) => e.action === 'allin'),
    category,
    bluffWin,
    kickerWin,
    beatLevels,
    decisions: decisions.length,
    goodDecisions: decisions.filter((d) => d.verdict.mark === 'good').length,
    session,
  };
}
