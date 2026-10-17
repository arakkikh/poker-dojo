// CPU の思考。強さ（LEVELS）× 性格（PERSONALITIES）で行動が変わる。
// 返す行動には reason（日本語の理由）を付ける。振り返り機能（フェーズ③）でも使う。

import { fullDeck } from '../core/cards.js';
import { scoreHand, categoryOf, STRAIGHT } from '../core/evaluator.js';
import { estimateEquity, potOdds } from '../core/equity.js';
import { chenScore, topRange } from './preflop.js';
import { PERSONALITIES, LEVELS } from './personalities.js';
import { tendencies } from './memory.js';

const POSITION_BONUS = { BTN: 1.5, CO: 1, MP: 0, UTG: -0.5, SB: -0.5, BB: 0 };

/** 目標額へのレイズを合法な範囲に収める（額は step 単位に丸める）。レイズできなければコール/チェック */
function raiseTo(legal, target, step, reason) {
  if (!legal.canRaise) return legal.canCheck ? { type: 'check', reason } : { type: 'call', reason };
  const rounded = Math.round(target / step) * step;
  const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, rounded));
  return { type: 'raise', amount, reason };
}

const checkOrFold = (legal, reason) => (legal.canCheck ? { type: 'check', reason } : { type: 'fold', reason });
const checkOrCall = (legal, reason) => (legal.canCheck ? { type: 'check', reason } : { type: 'call', reason });

/**
 * アウツ（次の1枚でストレート以上が完成するカードの枚数）を数える。
 * すでにストレート以上なら 0。
 */
export function countOuts(hole, board) {
  if (board.length < 3 || board.length > 4) return 0;
  const cards = [...hole, ...board];
  if (categoryOf(scoreHand(cards)) >= STRAIGHT) return 0;
  const used = new Set(cards);
  let outs = 0;
  for (const c of fullDeck()) {
    if (used.has(c)) continue;
    const mine = categoryOf(scoreHand([...cards, c]));
    // ボードだけで完成してしまう（相手も同じ）カードは数えない
    const boardOnly = board.length + 1 >= 5 ? categoryOf(scoreHand([...board, c])) : -1;
    if (mine >= STRAIGHT && boardOnly < STRAIGHT) outs++;
  }
  return outs;
}

// ---------------- プリフロップ ----------------

function preflopDecision(view, P, L, rng) {
  const { legal, bigBlind } = view;
  const step = bigBlind / 2;
  const s = chenScore(view.hole[0], view.hole[1]);
  let eff = s + P.looseness;
  if (L.usePosition) {
    eff += POSITION_BONUS[view.position] ?? 0;
    eff -= Math.max(0, view.numPlayers - 4) * 0.25; // 人数が多いほど絞る
  }
  eff += (rng() - 0.5) * L.noise * 10;

  const toCallBB = legal.toCall / bigBlind;
  const raised = legal.currentBet > bigBlind;

  if (!raised) {
    const openThresh = 7.5 - P.aggression * 1.5;
    if (eff >= openThresh && rng() < 0.1 + P.aggression * 0.9) {
      return raiseTo(legal, bigBlind * (3 + view.limpers), step, '強い手なので先にレイズして主導権を取る');
    }
    const late = ['BTN', 'CO', 'SB'].includes(view.position);
    if (L.usePosition && late && view.limpers === 0 && eff >= openThresh - 2.5 && rng() < P.aggression * L.bluffScale) {
      return raiseTo(legal, bigBlind * 2.5, step, '後ろのポジションから、ブラインドを奪いにいくレイズ（スチール）');
    }
    if (legal.canCheck) return { type: 'check', reason: '追加のチップなしで次へ進める' };
    // 中級以上はリンプ（BBにコールだけ）を控えめにする
    const limpThresh = L.usePosition ? 7.5 - P.stickiness * 10 : 6;
    if (eff >= limpThresh) return { type: 'call', reason: '安く参加できるので様子を見る' };
    return { type: 'fold', reason: '参加するには弱い手' };
  }

  // レイズに直面
  const threeBetThresh = 13 - P.aggression * 2.5;
  if (s >= 12 || eff >= threeBetThresh) {
    if (rng() < 0.4 + P.aggression * 0.6) {
      return raiseTo(legal, legal.currentBet * 3, step, 'とても強い手なので、さらにレイズ（3ベット）');
    }
    return checkOrCall(legal, 'とても強い手。コールして相手に続けさせる');
  }
  const late = ['BTN', 'CO'].includes(view.position);
  if (L.bluffScale > 0 && late && s >= 6 && rng() < P.bluff * 0.25 * L.bluffScale) {
    return raiseTo(legal, legal.currentBet * 3, step, '相手を降ろすためのブラフの3ベット');
  }
  const callThresh = 7 + Math.log2(Math.max(1, toCallBB / 2)) * 1.6 - P.stickiness * 15;
  if (eff >= callThresh) return checkOrCall(legal, 'レイズされたが、コールする価値はある手');
  return checkOrFold(legal, 'レイズに対抗するには弱い');
}

// ---------------- フロップ以降 ----------------

/** 相手それぞれのレンジ（持っていそうな手）を推定する */
function opponentRanges(view, memory) {
  return view.opponents.map((o) => {
    const t = tendencies(memory, o.id);
    if (o.preflopAction === 'raise') return topRange(Math.max(0.08, Math.min(0.35, t.pfr * 1.2)));
    if (o.preflopAction === 'call') return topRange(Math.max(0.2, Math.min(0.7, t.vpip * 1.2)));
    return null; // BBのチェックなど: 何でもありうる
  });
}

function postflopDecision(view, P, L, rng, memory, iterations) {
  const { legal, pot } = view;
  const step = view.bigBlind / 2;
  const n = view.opponents.length;
  let { equity } = estimateEquity({
    hole: view.hole,
    board: view.board,
    opponents: Math.max(1, n),
    iterations,
    rng,
    ranges: L.useRanges ? opponentRanges(view, memory) : null,
  });
  // 中級: このストリートで攻撃されたら、相手は強いと見て勝率を割り引く
  if (L.usePotOdds && !L.useRanges) equity *= Math.pow(0.9, view.streetRaises);
  if (L.useRanges) equity *= Math.pow(0.95, view.streetRaises);
  equity += (rng() - 0.5) * L.noise;

  const outs = countOuts(view.hole, view.board);
  const isDraw = outs >= 8;
  const multiway = (n - 1) * 0.04;

  // 相手のクセ（上級のみ）
  let foldy = 1;
  let sticky = false;
  if (L.exploit && n === 1) {
    const t = tendencies(memory, view.opponents[0].id);
    if (t.foldToBet > 0.6) foldy = 1.8; // よく降りる相手にはブラフを増やす
    if (t.foldToBet < 0.3 && t.vpip > 0.45) {
      foldy = 0.3; // 降りない相手にはブラフを減らし、
      sticky = true; // 中くらいの手でも価値のベットをする
    }
  }
  const bluffP = P.bluff * L.bluffScale * foldy * (n === 1 ? 1 : 0.3);
  const sizeFor = (strength) => {
    if (!L.usePotOdds) return 0.6; // 初級はいつも同じ額
    let f = strength > 0.8 ? 0.75 : 0.55;
    if (sticky) f += 0.2;
    return f;
  };

  if (legal.toCall === 0) {
    const valueThresh = 0.62 + multiway - (sticky ? 0.06 : 0);
    if (equity >= valueThresh) {
      if (rng() < 0.45 + P.aggression * 0.55) {
        return raiseTo(legal, pot * sizeFor(equity), step, '勝っている可能性が高いので、チップを増やすためにベット（バリューベット）');
      }
      return { type: 'check', reason: '強い手だが、わざとチェックして相手にベットさせる（スロープレイ）' };
    }
    const wasAggressor = view.preflopAggressor && view.preflopAggressor === view.legal.playerId;
    if (L.usePosition && wasAggressor && view.street === 'flop' && n <= 2 && rng() < P.aggression * 0.75) {
      return raiseTo(legal, pot * 0.5, step, 'プリフロップでレイズした流れで続けてベット（継続ベット）');
    }
    if (isDraw && L.bluffScale > 0 && rng() < Math.min(0.7, bluffP * 2)) {
      return raiseTo(legal, pot * 0.6, step, `まだ完成していないが、アウツが${outs}枚ある。降ろせれば勝ち、当たっても勝ち（セミブラフ）`);
    }
    if (equity < 0.35 && rng() < bluffP) {
      return raiseTo(legal, pot * (view.street === 'river' ? 0.7 : 0.6), step, '弱い手だが、相手を降ろすためにベット（ブラフ）');
    }
    return { type: 'check', reason: 'ベットするほど強くないのでチェック' };
  }

  // ベットに直面
  const odds = potOdds(legal.toCall, pot);
  if (equity >= 0.78 + multiway && rng() < 0.3 + P.aggression * 0.6) {
    return raiseTo(legal, legal.currentBet + (pot + legal.toCall) * 0.8, step, 'かなり強い手なのでレイズで額を引き上げる');
  }
  if (L.bluffScale > 0 && n === 1 && isDraw && view.street !== 'river' && rng() < bluffP * 0.5) {
    return raiseTo(legal, legal.currentBet * 2.5, step, `アウツ${outs}枚のドローでレイズ（セミブラフ）`);
  }
  let need;
  if (L.usePotOdds) {
    const implied = view.street === 'flop' && isDraw ? 0.04 : 0; // 完成したら追加で稼げる見込み
    need = odds + 0.03 - implied - P.stickiness;
  } else {
    need = Math.max(odds, 0.35) - P.stickiness; // 初級: 手の強さの感覚で判断
  }
  if (equity >= need) {
    return {
      type: 'call',
      reason: L.usePotOdds
        ? `勝率 約${Math.round(equity * 100)}% がコールに必要な ${Math.round(odds * 100)}% を上回る（ポットオッズ）`
        : 'そこそこ強い手なのでコール',
    };
  }
  return { type: 'fold', reason: 'このベットに付いていくには勝率が足りない' };
}

/**
 * CPU の行動を決める
 * @param {ReturnType<import('../core/game.js').Hand['viewFor']>} view
 * @param {object} [o]
 * @param {string} [o.level] beginner | intermediate | advanced
 * @param {string} [o.personality] cautious | aggressive | station | solid
 * @param {object} [o.memory] memory.js の傾向データ
 * @returns {{type:string, amount?:number, reason:string}}
 */
export function decide(view, { level = 'beginner', personality = 'solid', memory = null, rng = Math.random, iterations } = {}) {
  if (!view.legal) throw new Error('手番ではありません');
  const P = PERSONALITIES[personality];
  const L = LEVELS[level];
  if (view.street === 'preflop') return preflopDecision(view, P, L, rng);
  return postflopDecision(view, P, L, rng, memory, iterations ?? L.iterations);
}
