// 1ハンドの進行を管理するエンジン（ノーリミット・テキサスホールデム）。
// DOMには依存しない。UIは events 配列を順に読んで演出する。

import { shuffledDeck } from './cards.js';
import { scoreHand, evaluateHand } from './evaluator.js';

export const STREET_NAMES = {
  preflop: 'プリフロップ',
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
  showdown: 'ショーダウン',
};

export const ACTION_NAMES = {
  fold: 'フォールド',
  check: 'チェック',
  call: 'コール',
  bet: 'ベット',
  raise: 'レイズ',
  allin: 'オールイン',
};

const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };
const BOARD_COUNT = { flop: 3, turn: 1, river: 1 };

export class Hand {
  /**
   * @param {object} o
   * @param {{id:string,name:string,stack:number}[]} o.players 席順（時計回り）。チップ0の人は含めない
   * @param {number} o.buttonIndex players 内のディーラーボタンの位置
   * @param {number} o.smallBlind
   * @param {number} o.bigBlind
   * @param {number} [o.ante]
   * @param {() => number} [o.rng]
   * @param {number[][]} [o.presetHoles] テストやシナリオ用: 各プレイヤーの手札を固定
   * @param {number[]} [o.presetBoard] テストやシナリオ用: ボード5枚を固定
   */
  constructor({ players, buttonIndex, smallBlind, bigBlind, ante = 0, rng = Math.random, presetHoles, presetBoard }) {
    if (players.length < 2) throw new Error('2人以上必要です');
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      startStack: p.stack,
      hole: [],
      bet: 0, // このストリートで出した額
      totalBet: 0, // このハンドで出した総額
      folded: false,
      allIn: false,
      actedAtBet: null, // このストリートで最後に自分の意思で行動したときの currentBet
      lastAction: null,
    }));
    this.n = players.length;
    this.buttonIndex = buttonIndex;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.ante = ante;
    this.board = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = bigBlind;
    this.lastFullRaiseBet = 0;
    this.toAct = -1;
    this.isComplete = false;
    this.events = [];
    this.results = null;

    // デッキ準備（固定カードを除いてシャッフル）
    const fixed = new Set([...(presetHoles || []).flat(), ...(presetBoard || [])]);
    this.deck = shuffledDeck(rng).filter((c) => !fixed.has(c));
    this.presetBoard = presetBoard ? [...presetBoard] : null;

    if (this.n === 2) {
      this.sbIndex = buttonIndex;
      this.bbIndex = this.next(buttonIndex);
    } else {
      this.sbIndex = this.next(buttonIndex);
      this.bbIndex = this.next(this.sbIndex);
    }

    this.start(presetHoles);
  }

  next(i) {
    return (i + 1) % this.n;
  }

  get pot() {
    return this.players.reduce((s, p) => s + p.totalBet, 0);
  }

  get currentPlayer() {
    return this.toAct >= 0 ? this.players[this.toAct] : null;
  }

  playerById(id) {
    return this.players.find((p) => p.id === id);
  }

  emit(e) {
    this.events.push(e);
  }

  /** チップを場に出す（スタック不足ならあるだけ） */
  put(p, amount, toStreetBet = true) {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.totalBet += a;
    if (toStreetBet) p.bet += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  drawCard() {
    return this.deck.pop();
  }

  start(presetHoles) {
    if (this.ante > 0) {
      for (const p of this.players) {
        const a = this.put(p, this.ante, false);
        this.emit({ type: 'ante', playerId: p.id, amount: a });
      }
    }
    const sb = this.players[this.sbIndex];
    const bb = this.players[this.bbIndex];
    this.emit({ type: 'blind', playerId: sb.id, kind: 'SB', amount: this.put(sb, this.smallBlind) });
    this.emit({ type: 'blind', playerId: bb.id, kind: 'BB', amount: this.put(bb, this.bigBlind) });
    this.currentBet = Math.max(sb.bet, bb.bet, this.bigBlind);
    this.lastFullRaiseBet = this.currentBet;
    this.minRaise = this.bigBlind;

    // 手札を配る（SBから1枚ずつ2周）
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < this.n; k++) {
        const i = (this.sbIndex + k) % this.n;
        const p = this.players[i];
        p.hole.push(presetHoles ? presetHoles[i][round] : this.drawCard());
      }
    }
    this.emit({ type: 'deal' });

    this.toAct = this.findNextToAct(this.next(this.bbIndex));
    if (this.toAct < 0) this.endBettingRound();
  }

  canAct(p) {
    return !p.folded && !p.allIn;
  }

  othersCanAct(p) {
    return this.players.some((q) => q !== p && this.canAct(q));
  }

  needsAction(p) {
    if (!this.canAct(p)) return false;
    if (p.bet < this.currentBet) return true;
    return p.actedAtBet === null && this.othersCanAct(p);
  }

  findNextToAct(from) {
    for (let k = 0; k < this.n; k++) {
      const i = (from + k) % this.n;
      if (this.needsAction(this.players[i])) return i;
    }
    return -1;
  }

  /** 現在の手番プレイヤーが取れる行動 */
  legalActions() {
    const p = this.currentPlayer;
    if (!p) return null;
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxRaiseTo = p.bet + p.stack;
    const reopened = p.actedAtBet === null || this.lastFullRaiseBet > p.actedAtBet;
    const canRaise = p.stack > toCall && this.othersCanAct(p) && reopened;
    return {
      playerId: p.id,
      toCall,
      canCheck: toCall === 0,
      canRaise,
      isBet: this.currentBet === 0, // true なら「ベット」、false なら「レイズ」
      minRaiseTo: Math.min(this.currentBet + this.minRaise, maxRaiseTo),
      maxRaiseTo,
      currentBet: this.currentBet,
      pot: this.pot,
      stack: p.stack,
    };
  }

  /**
   * 行動する。
   * @param {{type:'fold'|'check'|'call'|'raise'|'allin', amount?:number}} action raise の amount は「合計いくらにするか」
   */
  act(action) {
    if (this.isComplete) throw new Error('ハンドは終了しています');
    const p = this.currentPlayer;
    const legal = this.legalActions();
    let { type } = action;

    if (type === 'allin') {
      type = legal.canRaise ? 'raise' : 'call';
      action = { type, amount: legal.maxRaiseTo };
    }
    if (type === 'check' && !legal.canCheck) throw new Error('チェックできません');

    let label = type;
    let added = 0;
    switch (type) {
      case 'fold':
        p.folded = true;
        break;
      case 'check':
        break;
      case 'call':
        added = this.put(p, legal.toCall);
        if (legal.toCall === 0) label = 'check';
        break;
      case 'raise': {
        if (!legal.canRaise) throw new Error('レイズできません');
        const to = Math.min(Math.floor(action.amount), legal.maxRaiseTo);
        if (to < legal.minRaiseTo) throw new Error(`最低 ${legal.minRaiseTo} までレイズが必要です`);
        const raiseSize = to - this.currentBet;
        added = this.put(p, to - p.bet);
        if (raiseSize >= this.minRaise) {
          this.minRaise = raiseSize;
          this.lastFullRaiseBet = to;
        }
        label = legal.isBet ? 'bet' : 'raise';
        this.currentBet = to;
        break;
      }
      default:
        throw new Error(`不明なアクション: ${type}`);
    }
    if (p.allIn && type !== 'fold') label = 'allin';
    p.actedAtBet = this.currentBet;
    p.lastAction = label;
    this.emit({
      type: 'action',
      playerId: p.id,
      action: label,
      amount: added,
      to: p.bet,
      street: this.street,
      isRaise: type === 'raise', // ベット/レイズ（オールインのレイズを含む）
    });

    const alive = this.players.filter((q) => !q.folded);
    if (alive.length === 1) {
      this.refundUncalled();
      this.finishUncontested(alive[0]);
      return;
    }
    this.toAct = this.findNextToAct(this.next(this.toAct));
    if (this.toAct < 0) this.endBettingRound();
  }

  /** 誰にもコールされなかったベットの超過分を返す */
  refundUncalled() {
    const sorted = [...this.players].sort((a, b) => b.bet - a.bet);
    const [top, second] = sorted;
    const diff = top.bet - (second ? second.bet : 0);
    if (diff > 0) {
      top.bet -= diff;
      top.totalBet -= diff;
      top.stack += diff;
      if (top.stack > 0) top.allIn = false;
      this.emit({ type: 'refund', playerId: top.id, amount: diff });
    }
  }

  endBettingRound() {
    this.refundUncalled();
    for (const p of this.players) {
      p.bet = 0;
      p.actedAtBet = null;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastFullRaiseBet = 0;
    this.toAct = -1;

    const alive = this.players.filter((p) => !p.folded);
    const actors = alive.filter((p) => !p.allIn);
    const noMoreBetting = actors.length < 2;
    if (noMoreBetting && !this.revealed && this.street !== 'river') {
      this.revealed = true;
      this.emit({ type: 'reveal', hands: alive.map((p) => ({ playerId: p.id, hole: [...p.hole] })) });
    }

    if (this.street === 'river') {
      this.showdown();
      return;
    }

    this.street = NEXT_STREET[this.street];
    const count = BOARD_COUNT[this.street];
    for (let i = 0; i < count; i++) {
      this.board.push(this.presetBoard ? this.presetBoard[this.board.length] : this.drawCard());
    }
    this.emit({ type: 'street', street: this.street, board: [...this.board] });

    if (noMoreBetting) {
      this.endBettingRound();
      return;
    }
    this.toAct = this.findNextToAct(this.next(this.buttonIndex));
    if (this.toAct < 0) this.endBettingRound();
  }

  finishUncontested(winner) {
    const amount = this.pot;
    winner.stack += amount;
    this.emit({ type: 'win', pots: [{ amount, winners: [winner.id], description: null }], uncontested: true });
    this.complete({ uncontested: true, pots: [{ amount, winners: [winner.id], eligible: [winner.id] }] });
  }

  /** サイドポットを含むポットの一覧を作る */
  buildPots() {
    const alive = this.players.filter((p) => !p.folded);
    const levels = [...new Set(alive.map((p) => p.totalBet))].sort((a, b) => a - b);
    const maxContribution = Math.max(...this.players.map((p) => p.totalBet));
    const pots = [];
    let prev = 0;
    levels.forEach((level, idx) => {
      const top = idx === levels.length - 1 ? Math.max(level, maxContribution) : level;
      let amount = 0;
      for (const p of this.players) amount += Math.min(p.totalBet, top) - Math.min(p.totalBet, prev);
      const eligible = alive.filter((p) => p.totalBet >= level).map((p) => p.id);
      const last = pots[pots.length - 1];
      if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else if (amount > 0) pots.push({ amount, eligible });
      prev = top;
    });
    return pots;
  }

  showdown() {
    this.street = 'showdown';
    const alive = this.players.filter((p) => !p.folded);
    const evals = {};
    for (const p of alive) {
      const ev = evaluateHand([...p.hole, ...this.board]);
      evals[p.id] = ev;
    }
    this.emit({
      type: 'showdown',
      hands: alive.map((p) => ({ playerId: p.id, hole: [...p.hole], eval: evals[p.id] })),
    });

    // 端数チップはボタンの左隣から順に配る
    const order = [];
    for (let k = 1; k <= this.n; k++) order.push(this.players[(this.buttonIndex + k) % this.n].id);

    const pots = this.buildPots().map((pot) => {
      const best = Math.max(...pot.eligible.map((id) => evals[id].score));
      const winners = order.filter((id) => pot.eligible.includes(id) && evals[id].score === best);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const id of winners) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        this.playerById(id).stack += share + extra;
      }
      return { ...pot, winners, description: evals[winners[0]].description };
    });
    this.emit({ type: 'win', pots, uncontested: false });
    this.complete({ uncontested: false, pots, evals });
  }

  complete(results) {
    this.isComplete = true;
    this.toAct = -1;
    this.results = {
      ...results,
      board: [...this.board],
      net: Object.fromEntries(this.players.map((p) => [p.id, p.stack - p.startStack])),
    };
    this.emit({ type: 'end' });
  }

  /** 指定プレイヤーから見えるゲーム状況（CPU思考・ヒント用。他人の手札は含めない） */
  viewFor(playerId) {
    const me = this.playerById(playerId);
    const actions = this.events.filter((e) => e.type === 'action');
    const pre = actions.filter((e) => e.street === 'preflop');
    const preflopAction = {};
    let preflopAggressor = null;
    let limpers = 0;
    let preflopRaises = 0;
    for (const e of pre) {
      if (e.isRaise) {
        preflopAggressor = e.playerId;
        preflopRaises++;
      } else if (e.action === 'call' && preflopRaises === 0) limpers++;
      preflopAction[e.playerId] = e.isRaise ? 'raise' : e.action === 'allin' ? 'call' : e.action;
    }
    const streetRaises = actions.filter((e) => e.street === this.street && e.isRaise).length;
    return {
      street: this.street,
      hole: [...me.hole],
      board: [...this.board],
      pot: this.pot,
      stack: me.stack,
      bigBlind: this.bigBlind,
      smallBlind: this.smallBlind,
      legal: this.toAct >= 0 && this.currentPlayer.id === playerId ? this.legalActions() : null,
      opponents: this.players
        .filter((p) => p.id !== playerId && !p.folded)
        .map((p) => ({
          id: p.id,
          stack: p.stack,
          bet: p.bet,
          allIn: p.allIn,
          lastAction: p.lastAction,
          preflopAction: preflopAction[p.id] || null,
          position: this.positionOf(p.id),
        })),
      numPlayers: this.n,
      isButton: this.players[this.buttonIndex].id === playerId,
      position: this.positionOf(playerId),
      preflopAggressor,
      limpers,
      streetRaises,
    };
  }

  /** ポジション名（BTN/SB/BB/UTG/MP/CO） */
  positionOf(playerId) {
    const i = this.players.findIndex((p) => p.id === playerId);
    if (this.n === 2) return i === this.buttonIndex ? 'BTN' : 'BB';
    if (i === this.buttonIndex) return 'BTN';
    if (i === this.sbIndex) return 'SB';
    if (i === this.bbIndex) return 'BB';
    // BBの次から順に UTG, ... 最後(ボタンの右)が CO
    const fromBB = (i - this.bbIndex + this.n) % this.n; // 1..n-3
    if (fromBB === 1) return 'UTG';
    if (fromBB === this.n - 3) return 'CO';
    return 'MP';
  }
}

/** 複数ハンドをまたいでプレイヤーのチップとボタン位置を管理する */
export class Table {
  constructor({ players, smallBlind, bigBlind, ante = 0, rng = Math.random }) {
    this.players = players.map((p) => ({ ...p })); // 席順
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.ante = ante;
    this.rng = rng;
    this.buttonSeat = Math.floor(rng() * players.length);
    this.handCount = 0;
    this.hand = null;
  }

  activePlayers() {
    return this.players.filter((p) => p.stack > 0);
  }

  /** 次のハンドを開始する。2人未満なら null */
  startHand(options = {}) {
    const active = this.activePlayers();
    if (active.length < 2) return null;
    if (this.handCount > 0) {
      // ボタンを次のチップを持つ席へ
      for (let k = 1; k <= this.players.length; k++) {
        const s = (this.buttonSeat + k) % this.players.length;
        if (this.players[s].stack > 0) {
          this.buttonSeat = s;
          break;
        }
      }
    } else if (this.players[this.buttonSeat].stack <= 0) {
      this.buttonSeat = this.players.indexOf(active[0]);
    }
    const buttonIndex = active.indexOf(this.players[this.buttonSeat]);
    this.handCount++;
    this.hand = new Hand({
      players: active,
      buttonIndex,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      rng: this.rng,
      ...options,
    });
    return this.hand;
  }

  /** ハンド終了後、チップをテーブル側に反映 */
  settleHand() {
    if (!this.hand || !this.hand.isComplete) return;
    for (const hp of this.hand.players) {
      const tp = this.players.find((p) => p.id === hp.id);
      tp.stack = hp.stack;
    }
  }
}
