// CPU の思考。フェーズ①は「初級（素直）」のみ。強さ・性格はフェーズ②で追加する。

import { estimateEquity, potOdds } from '../core/equity.js';
import { chenScore } from './preflop.js';

/** 目標額へのレイズを合法な範囲に収める（額は step 単位に丸める）。レイズできなければコール/チェック */
function raiseTo(legal, target, step = 1) {
  if (!legal.canRaise) return legal.canCheck ? { type: 'check' } : { type: 'call' };
  const rounded = Math.round(target / step) * step;
  const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, rounded));
  return { type: 'raise', amount };
}

const checkOrFold = (legal) => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
const checkOrCall = (legal) => (legal.canCheck ? { type: 'check' } : { type: 'call' });

function preflopDecision(view, rng) {
  const { legal, bigBlind } = view;
  const s = chenScore(view.hole[0], view.hole[1]);
  const toCallBB = legal.toCall / bigBlind;
  const raised = legal.currentBet > bigBlind; // 誰かがレイズ済み
  const step = bigBlind / 2;

  if (s >= 12) {
    // プレミアム: レイズ（すでにレイズされていれば 3倍に）
    const target = raised ? legal.currentBet * 3 : bigBlind * 3;
    return rng() < 0.85 ? raiseTo(legal, target, step) : checkOrCall(legal);
  }
  if (s >= 9) {
    if (!raised) return rng() < 0.6 ? raiseTo(legal, bigBlind * 3, step) : checkOrCall(legal);
    return toCallBB <= 8 ? checkOrCall(legal) : checkOrFold(legal);
  }
  if (s >= 7) {
    return toCallBB <= 3 ? checkOrCall(legal) : checkOrFold(legal);
  }
  if (s >= 5) {
    return toCallBB <= 1 ? checkOrCall(legal) : checkOrFold(legal);
  }
  // 弱い手でもたまにはリンプする（初心者っぽさ）
  if (toCallBB <= 0.5 && rng() < 0.4) return checkOrCall(legal);
  return checkOrFold(legal);
}

function postflopDecision(view, rng, iterations) {
  const { legal, pot } = view;
  const { equity } = estimateEquity({
    hole: view.hole,
    board: view.board,
    opponents: Math.max(1, view.opponents.length),
    iterations,
    rng,
  });
  const odds = potOdds(legal.toCall, pot);
  const step = view.bigBlind / 2;

  if (equity >= 0.75) {
    // 強い手: たまにスロープレイ（わざと弱く見せる）
    if (rng() < 0.2) return checkOrCall(legal);
    return raiseTo(legal, legal.currentBet + pot * 0.66, step);
  }
  if (equity >= 0.55 && legal.canCheck) {
    return rng() < 0.5 ? raiseTo(legal, pot * 0.5, step) : { type: 'check' };
  }
  if (legal.canCheck) return { type: 'check' };
  if (equity > odds + 0.05) return { type: 'call' };
  return { type: 'fold' };
}

/**
 * CPU の行動を決める
 * @param {ReturnType<import('../core/game.js').Hand['viewFor']>} view
 * @returns {{type:string, amount?:number}}
 */
export function decide(view, { rng = Math.random, iterations = 400 } = {}) {
  if (!view.legal) throw new Error('手番ではありません');
  if (view.street === 'preflop') return preflopDecision(view, rng);
  return postflopDecision(view, rng, iterations);
}
