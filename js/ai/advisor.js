// 初心者向けの「おすすめアクション」と理由。ヒント付き対戦・ドリル・振り返りで使う。
// CPUの思考と違い、ランダム性のない分かりやすい基準で判断する。

import { chenScore, handTier, handLabelJa } from './preflop.js';
import { countOuts } from './cpu.js';
import { potOdds } from '../core/equity.js';

/** ポジションごとの「先に参加（レイズ）してよい」最低チェン点数 */
const OPEN_THRESHOLD = { UTG: 8, MP: 7, CO: 6, BTN: 5, SB: 6, BB: 7 };
const POSITION_JA = { UTG: 'UTG（最初に行動する席）', MP: 'MP（中ほどの席）', CO: 'CO（ボタンの右）', BTN: 'ボタン（一番有利な席）', SB: 'SB', BB: 'BB' };

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * プリフロップの判断
 * @param {object} o
 * @param {number[]} o.hole
 * @param {string} o.position BTN/SB/BB/UTG/MP/CO
 * @param {number} o.numPlayers 卓の人数
 * @param {number} o.toCallBB コールに必要な額（BB単位）
 * @param {boolean} o.raised 誰かがすでにレイズしているか
 * @param {boolean} o.canCheck
 * @returns {{action:'raise'|'call'|'check'|'fold', reason:string}}
 */
export function preflopAdvice({ hole, position, numPlayers, toCallBB, raised, canCheck }) {
  const s = chenScore(hole[0], hole[1]);
  const tier = handTier(hole[0], hole[1]);
  const label = `${handLabelJa(hole[0], hole[1])}（${tier.label}）`;
  // 人数が少ないほど参加の基準を下げる
  let threshold = OPEN_THRESHOLD[position] ?? 8;
  if (numPlayers === 2) threshold = position === 'BTN' ? 4 : 6;
  else if (numPlayers <= 4) threshold -= 1;
  const where = POSITION_JA[position] || position;

  if (raised) {
    if (s >= 12) return { action: 'raise', reason: `${label}はとても強い手。レイズされても、さらにレイズしてよい` };
    if (s >= 9 && toCallBB <= 10) return { action: 'call', reason: `${label}は強い手。このくらいのレイズならコールして続けよう` };
    if (position === 'BB' && s >= 7 && toCallBB <= 2.5) {
      return { action: 'call', reason: `${label}。BBはすでに1BB出しているので、小さめのレイズなら安く参加できる。コールで守ろう` };
    }
    if (s >= 10) return { action: 'call', reason: `${label}は強い手。大きいレイズだが、降りるのはもったいない` };
    return { action: canCheck ? 'check' : 'fold', reason: `レイズに対抗するには${label}では弱い。誰かがレイズしたら参加の基準を上げよう` };
  }
  if (s >= threshold) {
    return { action: 'raise', reason: `${where}で${label}なら十分強い。コールではなくレイズで参加しよう` };
  }
  if (canCheck) return { action: 'check', reason: `${label}。追加のチップなしでフロップを見られるのでチェック` };
  if (position === 'SB' && s >= Math.max(4, threshold - 1) && toCallBB <= 0.5) {
    return { action: 'call', reason: `${label}。SBは残り半分を出すだけで参加できるのでコールも可` };
  }
  return { action: 'fold', reason: `${where}で${label}は参加するには弱い。弱い手で参加しすぎないことが大切` };
}

/**
 * フロップ以降の判断
 * @param {object} o
 * @param {number} o.equity 勝率（0〜1、相手の手はランダムと仮定）
 * @param {number} o.toCall
 * @param {number} o.pot 相手のベットを含むポット
 * @param {number} o.opponents 残っている相手の人数
 * @param {string} o.street
 * @param {number[]} o.hole
 * @param {number[]} o.board
 * @param {number} [o.streetRaises] このストリートで相手がベット/レイズした回数
 */
export function postflopAdvice({ equity, toCall, pot, opponents, street, hole, board, streetRaises = 0 }) {
  const outs = street === 'river' ? 0 : countOuts(hole, board);
  const drawNote = outs >= 4 ? `アウツは${outs}枚（${street === 'flop' ? `×4で約${outs * 4}%` : `×2で約${outs * 2}%`}）。` : '';
  const strong = 0.62 + (opponents - 1) * 0.06;

  if (toCall === 0) {
    if (equity >= strong) {
      return { action: 'bet', size: equity > 0.8 ? 0.75 : 0.5, reason: `勝率${pct(equity)}で勝っている可能性が高い。ベットしてポットを大きくしよう（バリューベット）` };
    }
    if (outs >= 8 && opponents === 1) {
      return { action: 'check', alt: 'bet', reason: `${drawNote}チェックで無料で次のカードを見るのが基本。相手が1人なら、ベットして降ろしにいく（セミブラフ）のも選択肢` };
    }
    return { action: 'check', reason: `勝率${pct(equity)}。ベットするほど強くないのでチェックで様子を見よう` };
  }

  const need = potOdds(toCall, pot);
  const caution = streetRaises > 0 ? '（ベットしてきた相手は強い手のことが多いので、実際の勝率はもう少し低いかも）' : '';
  if (equity >= 0.8 + (opponents - 1) * 0.05) {
    return { action: 'raise', reason: `勝率${pct(equity)}とかなり強い。レイズしてさらに稼ごう` };
  }
  if (equity >= need) {
    return {
      action: 'call',
      reason: `勝率${pct(equity)}が、コールに必要な勝率${pct(need)}を上回っている。${drawNote}コールは長い目で見て得${caution}`,
    };
  }
  const implied = street === 'flop' && outs >= 8 && equity >= need - 0.07;
  if (implied) {
    return {
      action: 'call',
      reason: `勝率${pct(equity)}は必要な${pct(need)}に少し足りないが、${drawNote}完成したときに追加で稼げる見込み（インプライドオッズ）があるのでコールも可`,
    };
  }
  return {
    action: 'fold',
    reason: `勝率${pct(equity)}が、コールに必要な勝率${pct(need)}に届かない。${drawNote}ここはフォールドが長い目で見て得${caution}`,
  };
}

/** 行動の大まかな種類: 'fold' | 'passive'（チェック/コール）| 'aggressive'（ベット/レイズ/オールイン） */
export function actionKind(type) {
  if (type === 'fold') return 'fold';
  if (type === 'check' || type === 'call') return 'passive';
  return 'aggressive';
}

/**
 * 実際の行動とおすすめを比べて評価する
 * @param {string} [street] 'preflop' なら文言を変える
 * @returns {{mark:'good'|'ok'|'bad', text:string}}
 */
export function judge(actual, advice, street = null) {
  const a = actionKind(actual);
  const r = actionKind(advice.action);
  const alt = advice.alt ? actionKind(advice.alt) : null;
  if (a === r || a === alt) return { mark: 'good', text: '良い判断' };
  if (a === 'fold') return { mark: 'bad', text: '降りすぎかも' };
  if (r === 'fold') return { mark: 'bad', text: street === 'preflop' ? '弱い手で参加しすぎ' : '勝率に対して払いすぎ' };
  if (a === 'aggressive') return { mark: 'ok', text: 'やや強気' };
  return { mark: 'ok', text: 'もっと強気でもよかった' };
}
