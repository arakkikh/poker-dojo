// 対戦テーブル画面。エンジン(Hand)が出すイベントを順に演出しながら進行する。

import { Table, STREET_NAMES } from '../core/game.js';
import { evaluateHand, CATEGORY_NAMES } from '../core/evaluator.js';
import { decide } from '../ai/cpu.js';
import { createCpu, PERSONALITIES, LEVELS } from '../ai/personalities.js';
import { createMemory, observeHand } from '../ai/memory.js';
import { preflopAdvice, postflopAdvice, judge } from '../ai/advisor.js';
import { potOdds } from '../core/equity.js';
import { computeEquity } from './equityClient.js';
import { handLabelJa, handTier } from '../ai/preflop.js';
import { cardHTML, backHTML, emptyHTML } from './cards.js';
import { sleep, fmt, escapeHTML, toast, showSheet } from './util.js';
import { recordHand } from '../store/storage.js';

const ME = 'you';

// 席の配置（%）。0番目は常に自分（画面下）
// cls: 席の向き（ベット額やバッジの表示位置に使う）
const ME_SEAT = { x: 50, y: 80, cls: 'me' };
const SEAT_LAYOUTS = {
  2: [ME_SEAT, { x: 50, y: 17, cls: 'top' }],
  3: [ME_SEAT, { x: 20, y: 24, cls: 'left' }, { x: 80, y: 24, cls: 'right' }],
  4: [ME_SEAT, { x: 14, y: 33, cls: 'left' }, { x: 50, y: 11, cls: 'top' }, { x: 86, y: 33, cls: 'right' }],
  5: [ME_SEAT, { x: 14, y: 66, cls: 'left' }, { x: 21, y: 22, cls: 'left' }, { x: 79, y: 22, cls: 'right' }, { x: 86, y: 66, cls: 'right' }],
  6: [
    ME_SEAT,
    { x: 14, y: 67, cls: 'left' },
    { x: 14, y: 32, cls: 'left' },
    { x: 50, y: 11, cls: 'top' },
    { x: 86, y: 32, cls: 'right' },
    { x: 86, y: 67, cls: 'right' },
  ],
};

const SPEEDS = { slow: 1.6, normal: 1, fast: 0.45 };
const pct = (x) => `${Math.round(x * 100)}%`;
const ACTION_JA = { fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', bet: 'ベット', allin: 'オールイン' };
const MARK_ICON = { good: '✅', ok: '🔸', bad: '⚠️' };
const LEVEL_IDS = Object.keys(LEVELS);

const BOARD_STREET = { 0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river' };

class Cancelled extends Error {}

export function mountTable(app, { navigate, config }) {
  const ctrl = new TableController(app, navigate, config);
  ctrl.run();
  return () => ctrl.destroy();
}

function actionText(e) {
  switch (e.action) {
    case 'fold':
      return 'フォールド';
    case 'check':
      return 'チェック';
    case 'call':
      return `コール ${fmt(e.to)}`;
    case 'bet':
      return `ベット ${fmt(e.to)}`;
    case 'raise':
      return `レイズ ${fmt(e.to)}`;
    case 'allin':
      return `オールイン ${fmt(e.to)}`;
    default:
      return e.action;
  }
}

class TableController {
  constructor(app, navigate, config) {
    this.app = app;
    this.navigate = navigate;
    this.config = config;
    this.alive = true;
    this.pendingResolve = null;
    this.raiseMode = false;
    this.raiseAmount = 0;
    this.speed = SPEEDS[config.speed] || 1;
    this.meta = { [ME]: { name: 'あなた', avatar: '🙂' } };

    app.innerHTML = `
      <div class="table-screen">
        <header class="tbar">
          <button class="back" aria-label="ホームへ戻る">‹</button>
          <div class="info">
            <span>ブラインド <b>${fmt(config.smallBlind)}/${fmt(config.bigBlind)}</b></span>
            <span class="hand-no"></span>
          </div>
        </header>
        <section class="felt">
          <div class="oval"></div>
          <div class="center">
            <div class="pot"></div>
            <div class="board"></div>
            <div class="street-label"></div>
          </div>
          <div class="seats"></div>
        </section>
        <div class="my-info"></div>
        ${config.hints ? '<div class="hint"></div>' : ''}
        <div class="actions"></div>
      </div>`;
    this.el = {
      handNo: app.querySelector('.hand-no'),
      pot: app.querySelector('.pot'),
      board: app.querySelector('.board'),
      street: app.querySelector('.street-label'),
      seats: app.querySelector('.seats'),
      felt: app.querySelector('.felt'),
      myInfo: app.querySelector('.my-info'),
      hint: app.querySelector('.hint'),
      actions: app.querySelector('.actions'),
    };
    app.querySelector('.back').addEventListener('click', () => {
      if (confirm('対戦をやめてホームに戻りますか？')) this.navigate('home');
    });
    this.el.actions.addEventListener('click', (e) => this.onActionClick(e));
    this.el.seats.addEventListener('click', (e) => {
      const seat = e.target.closest('[data-player]');
      if (seat) this.showPlayerInfo(seat.dataset.player);
    });
    this.el.actions.addEventListener('input', (e) => {
      if (e.target.matches('input[type=range]')) {
        this.raiseAmount = Number(e.target.value);
        this.updateRaiseLabel();
      }
    });
    this.newTable();
  }

  /** 新しいCPUを作る（強さ「ミックス」なら毎回ランダム） */
  makeCpu() {
    const { level } = this.config;
    const lv = level === 'mixed' ? LEVEL_IDS[Math.floor(Math.random() * LEVEL_IDS.length)] : level;
    const usedNames = Object.values(this.meta).map((m) => m.name);
    const cpu = createCpu({ level: lv, usedNames });
    this.meta[cpu.id] = cpu;
    return cpu;
  }

  newTable() {
    const { startingStack, smallBlind, bigBlind, numPlayers } = this.config;
    this.memory = createMemory();
    const cpus = Array.from({ length: numPlayers - 1 }, () => this.makeCpu());
    this.table = new Table({
      players: [
        { id: ME, name: 'あなた', stack: startingStack },
        ...cpus.map((c) => ({ id: c.id, name: c.name, stack: startingStack })),
      ],
      smallBlind,
      bigBlind,
    });
  }

  /** チップがなくなったCPUは席を立ち、新しいCPUが座る */
  replaceBustedCpus() {
    this.table.players.forEach((tp, seat) => {
      if (tp.id === ME || tp.stack > 0) return;
      const cpu = this.makeCpu();
      this.table.players[seat] = { id: cpu.id, name: cpu.name, stack: this.config.startingStack };
      toast(`${cpu.avatar} ${cpu.name}（${cpu.style}）が席に着きました`, 2600);
    });
  }

  showPlayerInfo(id) {
    const m = this.meta[id];
    if (!m || id === ME) return;
    const p = PERSONALITIES[m.personality];
    const l = LEVELS[m.level];
    toast(`${m.avatar} ${m.name}：${p.label}・${l.label}\n${p.desc}`, 3500);
  }

  destroy() {
    this.alive = false;
    if (this.pendingResolve) this.pendingResolve(null);
  }

  async wait(ms) {
    await sleep(ms * this.speed);
    if (!this.alive) throw new Cancelled();
  }

  async run() {
    try {
      while (this.alive) {
        const hand = this.table.startHand();
        await this.playHand(hand);
        const me = this.table.players.find((p) => p.id === ME);
        if (me.stack <= 0) {
          const again = await this.bustSheet();
          if (!this.alive) return;
          if (!again) {
            this.navigate('home');
            return;
          }
          me.stack = this.config.startingStack;
        }
        this.replaceBustedCpus();
      }
    } catch (e) {
      if (e instanceof Cancelled) return;
      console.error(e);
      toast('エラーが発生しました: ' + e.message, 5000);
    }
  }

  // ---------------- 1ハンドの進行 ----------------

  async playHand(hand) {
    this.hand = hand;
    this.cursor = 0;
    this.shownBoard = 0;
    this.boardAnimFrom = Infinity;
    this.dealAnim = false;
    this.revealed = false;
    this.awarded = false;
    this.showdown = null;
    this.bubbles = {};
    this.decisions = [];
    this.advice = null;
    if (this.el.hint) this.el.hint.innerHTML = '<div class="hint-wait">💡 あなたの番になるとヒントが出ます</div>';
    this.el.handNo.textContent = `ハンド #${this.table.handCount}`;
    this.render();
    await this.playEvents();

    while (!hand.isComplete) {
      const p = hand.currentPlayer;
      let action;
      if (p.id === ME) {
        action = await this.askHuman();
      } else {
        this.render();
        await this.wait(600 + Math.random() * 600);
        const m = this.meta[p.id];
        action = decide(hand.viewFor(p.id), { level: m.level, personality: m.personality, memory: this.memory });
      }
      if (!this.alive) throw new Cancelled();
      hand.act(action);
      await this.playEvents();
    }

    this.table.settleHand();
    observeHand(this.memory, hand);
    const summary = this.record();
    await this.showResult(summary);
  }

  async playEvents() {
    const hand = this.hand;
    while (this.cursor < hand.events.length) {
      const e = hand.events[this.cursor++];
      switch (e.type) {
        case 'blind':
          this.bubbles[e.playerId] = { text: `${e.kind} ${fmt(e.amount)}`, cls: 'blind' };
          break;
        case 'deal':
          this.dealAnim = true;
          this.render();
          await this.wait(500);
          break;
        case 'action':
          this.bubbles[e.playerId] = { text: actionText(e), cls: e.action };
          this.render();
          await this.wait(e.playerId === ME ? 250 : 500);
          break;
        case 'reveal':
          this.revealed = true;
          this.render();
          await this.wait(900);
          break;
        case 'street':
          this.boardAnimFrom = this.shownBoard;
          this.shownBoard = e.board.length;
          this.bubbles = {};
          this.render();
          await this.wait(this.revealed ? 1100 : 650);
          break;
        case 'showdown':
          this.revealed = true;
          this.showdown = e;
          this.render();
          await this.wait(700);
          break;
        case 'win': {
          this.awarded = true;
          this.bubbles = {};
          for (const p of hand.players) {
            const won = this.amountWon(p);
            if (won > 0) this.bubbles[p.id] = { text: `+${fmt(won)}`, cls: 'win' };
          }
          this.render();
          await this.wait(900);
          break;
        }
        default:
          break;
      }
    }
    this.render();
  }

  /** このハンドでポットから受け取った額 */
  amountWon(p) {
    return p.stack - (p.startStack - p.totalBet);
  }

  // ---------------- 描画 ----------------

  render() {
    const hand = this.hand;
    if (!hand) return;
    const layout = SEAT_LAYOUTS[this.table.players.length];
    this.el.felt.classList.toggle('multi', this.table.players.length > 2);

    // ボードとポット
    const board = hand.board.slice(0, this.shownBoard);
    const best = this.winningCards();
    let boardHTML = '';
    for (let i = 0; i < 5; i++) {
      if (i < board.length) {
        const cls = [i >= this.boardAnimFrom ? 'deal-in' : '', best.has(board[i]) ? 'highlight' : ''].join(' ');
        boardHTML += cardHTML(board[i], cls);
      } else boardHTML += emptyHTML();
    }
    this.el.board.innerHTML = boardHTML;
    this.boardAnimFrom = Infinity;

    const betsOnTable = hand.players.reduce((s, p) => s + p.bet, 0);
    const pot = this.awarded ? 0 : hand.pot - betsOnTable;
    this.el.pot.innerHTML = pot > 0 ? `<span class="chip-icon">●</span> ポット ${fmt(pot)}` : '';
    this.el.street.textContent = this.showdown ? 'ショーダウン' : STREET_NAMES[BOARD_STREET[this.shownBoard]];

    // 席（テーブルの席順で、自分を0番に）
    this.el.seats.innerHTML = this.table.players
      .map((tp, seat) => {
        const p = hand.playerById(tp.id);
        return this.seatHTML(tp, p, layout[seat], best);
      })
      .join('');
    this.dealAnim = false;

    this.renderMyInfo();
    if (!this.isHumanTurn()) this.renderWaiting();
  }

  seatHTML(tp, p, pos, best) {
    const hand = this.hand;
    const meta = this.meta[tp.id];
    const isMe = tp.id === ME;
    const style = `left:${pos.x}%;top:${pos.y}%`;
    const compact = !isMe && this.table.players.length > 2 ? 'compact' : '';
    if (!p) {
      return `<div class="seat ${pos.cls} folded" style="${style}"><div class="seat-cards"></div>
        <div class="seat-plate"><span class="name">${meta.avatar} ${escapeHTML(meta.name)}</span><span class="stack">0</span></div></div>`;
    }
    const active = !hand.isComplete && hand.currentPlayer && hand.currentPlayer.id === p.id;
    const faceUp = isMe || (this.revealed && !p.folded);
    const anim = this.dealAnim ? 'deal-in' : '';
    const cards = p.hole
      .map((c) => (faceUp ? cardHTML(c, [anim, best.has(c) ? 'highlight' : ''].join(' ')) : backHTML(anim)))
      .join('');

    const idx = hand.players.indexOf(p);
    let badge = '';
    if (idx === hand.buttonIndex) {
      badge = `<span class="pos-badge dealer">${hand.n === 2 ? 'D・SB' : 'D'}</span>`;
    }
    else if (idx === hand.bbIndex) badge = '<span class="pos-badge">BB</span>';
    else if (idx === hand.sbIndex) badge = '<span class="pos-badge">SB</span>';

    const stack = this.awarded ? p.stack : p.startStack - p.totalBet;
    const bubble = this.bubbles[p.id];
    const sd = this.showdown && this.showdown.hands.find((x) => x.playerId === p.id);
    const nameLine = sd ? `<span class="hand-name">${sd.eval.description}</span>` : '';
    const betChip = p.bet > 0 && !this.awarded ? `<span class="bet-chip">${fmt(p.bet)}</span>` : '';

    return `
      <div class="seat ${pos.cls} ${compact} ${active ? 'active' : ''} ${p.folded ? 'folded' : ''}" style="${style}" data-player="${p.id}">
        ${bubble ? `<div class="bubble ${bubble.cls}">${bubble.text}</div>` : ''}
        <div class="seat-cards">${cards}</div>
        ${nameLine}
        <div class="seat-plate">
          ${badge}
          <span class="name">${meta.avatar} ${escapeHTML(meta.name)}</span>
          ${meta.style && !compact ? `<span class="style">${escapeHTML(meta.style)}</span>` : ''}
          <span class="stack">${fmt(stack)}</span>
        </div>
        ${betChip}
      </div>`;
  }

  /** ショーダウンで勝った人の役を構成するカード */
  winningCards() {
    const set = new Set();
    if (!this.showdown || !this.awarded) return set;
    const winners = new Set(this.hand.results.pots.flatMap((pot) => pot.winners));
    for (const h of this.showdown.hands) {
      if (winners.has(h.playerId)) h.eval.best.forEach((c) => set.add(c));
    }
    return set;
  }

  renderMyInfo() {
    const me = this.hand.playerById(ME);
    if (!me) {
      this.el.myInfo.innerHTML = '';
      return;
    }
    if (me.folded) {
      this.el.myInfo.innerHTML = 'フォールドしました';
      return;
    }
    if (this.shownBoard === 0) {
      const t = handTier(me.hole[0], me.hole[1]);
      this.el.myInfo.innerHTML = `あなたの手 <b>${handLabelJa(me.hole[0], me.hole[1])}</b>
        <span class="tier t${t.tier}">${t.label}</span>`;
    } else {
      const ev = evaluateHand([...me.hole, ...this.hand.board.slice(0, this.shownBoard)]);
      this.el.myInfo.innerHTML = `現在の役 <b>${ev.description}</b>`;
    }
  }

  isHumanTurn() {
    return !!this.pendingResolve;
  }

  renderWaiting() {
    const hand = this.hand;
    const p = hand.currentPlayer;
    if (p && p.id !== ME) {
      this.el.actions.innerHTML = `<div class="waiting">${this.meta[p.id].avatar} ${escapeHTML(this.meta[p.id].name)}が考え中<span class="dots"></span></div>`;
    } else {
      this.el.actions.innerHTML = `<div class="waiting">&nbsp;</div>`;
    }
  }

  // ---------------- 自分の操作 ----------------

  askHuman() {
    return new Promise((resolve) => {
      const legal = this.hand.legalActions();
      this.pendingResolve = (action) => {
        this.pendingResolve = null;
        this.raiseMode = false;
        if (action) this.recordDecision(action, legal);
        resolve(action);
      };
      this.render();
      this.renderActionBar();
      if (this.config.hints) this.updateHint();
    });
  }

  // ---------------- ヒント ----------------

  /** おすすめの行動を、今の状況で押せるボタンの表記にする */
  adviceLabel(advice, legal) {
    let a = advice.action;
    if ((a === 'raise' || a === 'bet') && !legal.canRaise) a = legal.canCheck ? 'check' : 'call';
    if (a === 'raise' || a === 'bet') {
      const word = legal.isBet ? 'ベット' : 'レイズ';
      return advice.amount ? `${word}（${fmt(advice.amount)}くらい）` : word;
    }
    return ACTION_JA[a];
  }

  async updateHint() {
    const hand = this.hand;
    const token = (this.hintToken = {});
    const view = hand.viewFor(ME);
    const { legal } = view;
    const opponents = view.opponents.length;
    this.advice = null;
    this.el.hint.innerHTML = '<div class="hint-wait">💡 勝率を計算中…</div>';
    const { equity } = await computeEquity({ hole: view.hole, board: view.board, opponents, iterations: 4000 });
    if (token !== this.hintToken || !this.alive || !this.pendingResolve) return;

    const bb = hand.bigBlind;
    let advice;
    let amount = null;
    if (view.street === 'preflop') {
      const raised = legal.currentBet > bb;
      advice = preflopAdvice({
        hole: view.hole,
        position: view.position,
        numPlayers: hand.n,
        toCallBB: legal.toCall / bb,
        raised,
        canCheck: legal.canCheck,
      });
      if (advice.action === 'raise') amount = raised ? legal.currentBet * 3 : bb * (3 + view.limpers);
    } else {
      advice = postflopAdvice({
        equity,
        toCall: legal.toCall,
        pot: legal.pot,
        opponents,
        street: view.street,
        hole: view.hole,
        board: view.board,
        streetRaises: view.streetRaises,
      });
      if (advice.action === 'bet') amount = legal.pot * advice.size;
      if (advice.action === 'raise') amount = legal.currentBet + (legal.pot + legal.toCall) * 0.8;
    }
    if (amount != null) {
      const step = hand.smallBlind;
      amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(amount / step) * step));
    }
    // プリフロップはまだ全員が行動していないので、ポットオッズは表示しない
    const need = legal.toCall > 0 && view.street !== 'preflop' ? potOdds(legal.toCall, legal.pot) : 0;
    this.advice = { ...advice, amount, equity, need, street: view.street };

    this.el.hint.innerHTML = `
      <div class="hint-top">
        <span>勝率 <b>${pct(equity)}</b></span>
        ${need ? `<span>必要 <b>${pct(need)}</b></span>` : ''}
        <span class="rec">おすすめ <b>${this.adviceLabel(this.advice, legal)}</b></span>
      </div>
      <div class="hint-reason">${advice.reason}</div>
      <div class="hint-note">※勝率は、相手${opponents}人の手札がランダムだと仮定した値</div>`;
    this.markRecommended();
  }

  /** おすすめのボタンを光らせる */
  markRecommended() {
    if (!this.advice || !this.pendingResolve) return;
    const legal = this.hand.legalActions();
    let a = this.advice.action;
    if ((a === 'raise' || a === 'bet') && !legal.canRaise) a = legal.canCheck ? 'check' : 'call';
    const act = { fold: 'fold', check: 'check', call: 'call', raise: 'raise-open', bet: 'raise-open' }[a];
    const btn = this.el.actions.querySelector(`[data-act="${act}"]`);
    if (btn) btn.classList.add('recommended');
  }

  recordDecision(action, legal) {
    if (!this.config.hints || !this.advice) return;
    // オールインが「足りない額でのコール」ならコール扱い
    const type = action.type === 'allin' && !legal.canRaise ? 'call' : action.type;
    this.decisions.push({
      street: this.advice.street,
      actual: type === 'raise' && legal.isBet ? 'bet' : type,
      advice: this.advice,
      label: this.adviceLabel(this.advice, legal),
      verdict: judge(type, this.advice, this.advice.street),
    });
    this.advice = null;
    this.hintToken = null;
    this.el.hint.innerHTML = '<div class="hint-wait">💡 あなたの番になるとヒントが出ます</div>';
  }

  reviewHTML(net) {
    if (!this.config.hints || !this.decisions.length) return '';
    const good = this.decisions.filter((d) => d.verdict.mark === 'good').length;
    const bad = this.decisions.filter((d) => d.verdict.mark === 'bad').length;
    let tip = '';
    if (bad === 0 && net < 0) tip = '判断は良かったので、今回負けたのは運です。良い判断を続ければ、長い目で見て勝てます。';
    else if (bad > 0 && net > 0) tip = '今回は勝てましたが、⚠️の判断は繰り返すと長い目で見て損をします。';
    else if (bad === 0) tip = 'すべて良い判断でした！この調子です。';
    const rows = this.decisions
      .map(
        (d) => `<div class="rv-row ${d.verdict.mark}">
          <div class="rv-head"><span>${STREET_NAMES[d.street]}</span><span>${MARK_ICON[d.verdict.mark]} ${d.verdict.text}</span></div>
          <div class="rv-body">あなた: <b>${ACTION_JA[d.actual]}</b>　おすすめ: <b>${d.label}</b><br>
            <small>勝率 ${pct(d.advice.equity)}${d.advice.need ? `／必要な勝率 ${pct(d.advice.need)}` : ''}</small></div>
          ${d.verdict.mark !== 'good' ? `<div class="rv-reason">${d.advice.reason}</div>` : ''}
        </div>`,
      )
      .join('');
    return `<div class="review"><h4>📝 振り返り <span>${good} / ${this.decisions.length} 良い判断</span></h4>${rows}${tip ? `<p class="rv-tip">${tip}</p>` : ''}</div>`;
  }

  renderActionBar() {
    const legal = this.hand.legalActions();
    if (this.raiseMode) {
      this.renderRaisePanel(legal);
      return;
    }
    queueMicrotask(() => this.markRecommended());
    const callLabel = legal.canCheck
      ? 'チェック'
      : legal.toCall >= legal.stack
        ? `オールイン<small>${fmt(legal.toCall)} でコール</small>`
        : `コール<small>${fmt(legal.toCall)}</small>`;
    const raiseWord = legal.isBet ? 'ベット' : 'レイズ';
    const raiseLabel = legal.canRaise
      ? `${raiseWord}<small>${fmt(legal.minRaiseTo)}〜</small>`
      : `${raiseWord}<small>できません</small>`;
    this.el.actions.innerHTML = `
      <div class="action-row">
        <button class="btn act-fold" data-act="fold" ${legal.canCheck ? 'disabled' : ''}>フォールド${legal.canCheck ? '<small>不要</small>' : ''}</button>
        <button class="btn act-call" data-act="${legal.canCheck ? 'check' : 'call'}">${callLabel}</button>
        <button class="btn act-raise" data-act="raise-open" ${legal.canRaise ? '' : 'disabled'}>${raiseLabel}</button>
      </div>`;
  }

  /** プリセット額（ポットの割合）を計算 */
  presetAmount(legal, kind) {
    if (kind === 'min') return legal.minRaiseTo;
    if (kind === 'max') return legal.maxRaiseTo;
    const f = kind === 'half' ? 0.5 : 1;
    const raw = legal.currentBet + f * (legal.pot + legal.toCall);
    const step = this.hand.smallBlind;
    return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(raw / step) * step));
  }

  renderRaisePanel(legal) {
    const step = this.hand.smallBlind;
    this.el.actions.innerHTML = `
      <div class="raise-panel">
        <div class="raise-amount"></div>
        <div class="presets">
          <button data-preset="min">最小</button>
          <button data-preset="half">½ポット</button>
          <button data-preset="pot">ポット</button>
          <button data-preset="max">オールイン</button>
        </div>
        <div class="slider-row">
          <button data-act="minus" aria-label="減らす">−</button>
          <input type="range" min="${legal.minRaiseTo}" max="${legal.maxRaiseTo}" step="${step}" value="${this.raiseAmount}">
          <button data-act="plus" aria-label="増やす">＋</button>
        </div>
        <div class="action-row two">
          <button class="btn" data-act="raise-cancel">戻る</button>
          <button class="btn act-raise" data-act="raise-confirm"></button>
        </div>
      </div>`;
    this.updateRaiseLabel();
  }

  updateRaiseLabel() {
    const legal = this.hand.legalActions();
    const amt = this.raiseAmount;
    const allin = amt >= legal.maxRaiseTo;
    const word = allin ? 'オールイン' : legal.isBet ? 'ベット' : 'レイズ';
    const label = this.el.actions.querySelector('.raise-amount');
    if (label) {
      const me = this.hand.currentPlayer;
      label.innerHTML = legal.isBet
        ? `ベット額 <b>${fmt(amt)}</b>（ポット ${fmt(legal.pot)}）`
        : `合計 <b>${fmt(amt)}</b> にレイズ（あと ${fmt(amt - me.bet)} 出す）`;
    }
    const btn = this.el.actions.querySelector('[data-act="raise-confirm"]');
    if (btn) btn.innerHTML = `${word} ${fmt(amt)}`;
    const slider = this.el.actions.querySelector('input[type=range]');
    if (slider && Number(slider.value) !== amt) slider.value = amt;
  }

  onActionClick(e) {
    if (!this.pendingResolve) return;
    const legal = this.hand.legalActions();
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      this.raiseAmount = this.presetAmount(legal, preset.dataset.preset);
      this.updateRaiseLabel();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    switch (btn.dataset.act) {
      case 'fold':
        this.pendingResolve({ type: 'fold' });
        break;
      case 'check':
        this.pendingResolve({ type: 'check' });
        break;
      case 'call':
        this.pendingResolve({ type: 'call' });
        break;
      case 'raise-open':
        this.raiseMode = true;
        this.raiseAmount =
          this.advice && this.advice.amount ? this.advice.amount : legal.isBet ? this.presetAmount(legal, 'half') : legal.minRaiseTo;
        this.renderActionBar();
        break;
      case 'raise-cancel':
        this.raiseMode = false;
        this.renderActionBar();
        break;
      case 'minus':
      case 'plus': {
        const d = (btn.dataset.act === 'plus' ? 1 : -1) * this.hand.bigBlind;
        this.raiseAmount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, this.raiseAmount + d));
        this.updateRaiseLabel();
        break;
      }
      case 'raise-confirm': {
        const amt = this.raiseAmount;
        this.pendingResolve(amt >= legal.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount: amt });
        break;
      }
      default:
        break;
    }
  }

  // ---------------- 結果と記録 ----------------

  record() {
    const hand = this.hand;
    const me = hand.playerById(ME);
    if (!me) return null;
    const net = hand.results.net[ME];
    const won = this.amountWon(me);
    const pre = hand.events.filter((e) => e.type === 'action' && e.playerId === ME && e.street === 'preflop');
    const showdownHand = this.showdown && this.showdown.hands.find((h) => h.playerId === ME);
    const category = !me.folded && hand.board.length === 5 ? evaluateHand([...me.hole, ...hand.board]).category : null;
    const { newCategory } = recordHand({
      net,
      won: won > 0,
      vpip: pre.some((e) => ['call', 'bet', 'raise', 'allin'].includes(e.action)),
      pfr: pre.some((e) => ['bet', 'raise'].includes(e.action) || (e.action === 'allin' && e.to > hand.bigBlind)),
      showdown: !!showdownHand,
      showdownWon: !!showdownHand && won > 0,
      potWon: won,
      category,
    });
    if (newCategory != null) toast(`📖 図鑑に「${CATEGORY_NAMES[newCategory]}」が登録されました！`, 3000);
    return { net, won, me };
  }

  async showResult(summary) {
    if (!summary) return;
    const hand = this.hand;
    const { net, won, me } = summary;
    const { pots } = hand.results;
    const nameOf = (id) => `${this.meta[id].avatar} ${escapeHTML(this.meta[id].name)}`;
    const signed = (n) => `${n >= 0 ? '+' : ''}${fmt(n)}`;
    const sharedWithMe = pots.some((p) => p.winners.includes(ME) && p.winners.length > 1);
    const mainWinners = pots[0].winners;

    let title;
    let cls;
    let sub;
    if (me.folded) {
      title = 'フォールド';
      cls = 'lose';
      sub = net < 0 ? `${fmt(-net)} チップを失いました` : 'チップは減っていません';
      sub += `<br>勝者: ${mainWinners.map(nameOf).join('・')}${pots[0].description ? `（${pots[0].description}）` : ''}`;
    } else if (hand.results.uncontested) {
      title = '勝ち！';
      cls = 'win';
      sub = `${hand.n === 2 ? '相手が' : '他の全員が'}フォールドしました（${signed(net)}）`;
    } else if (won > 0 && sharedWithMe) {
      title = '引き分け';
      cls = '';
      sub = `同じ強さの役でポットを分けました（${signed(net)}）`;
    } else if (won > 0) {
      title = '勝ち！';
      cls = 'win';
      const myPot = pots.find((p) => p.winners.includes(ME));
      sub = `${myPot.description}で勝利（${signed(net)}）`;
      if (pots.some((p) => !p.winners.includes(ME))) sub += '<br>ただし一部のサイドポットは他の人が獲得';
    } else {
      title = '負け…';
      cls = 'lose';
      sub = `${mainWinners.map(nameOf).join('・')}の${pots[0].description}に負けました（${signed(net)}）`;
    }

    // 同じ役同士ならキッカー（役以外のカード）で決着したことを伝える
    if (this.showdown && !sharedWithMe) {
      // 役の説明（例:「Aのワンペア」）まで同じなら、残りのカードで決まったということ
      const winnerDesc = pots[0].description;
      const sameDesc = this.showdown.hands.filter((h) => h.eval.description === winnerDesc).length;
      if (sameDesc >= 2 && mainWinners.length === 1) {
        sub += '<br>同じ役どうしなので、残りのカード（キッカー）の強さで決着しました';
      }
    }

    let potLines = '';
    if (pots.length > 1) {
      potLines = `<div class="pot-lines">${pots
        .map(
          (p, i) => `<div><span>${i === 0 ? 'メインポット' : `サイドポット${pots.length > 2 ? i : ''}`} ${fmt(p.amount)}</span>
            <span>→ ${p.winners.map(nameOf).join('・')}</span></div>`,
        )
        .join('')}</div>`;
    }

    let hands = '';
    if (this.showdown) {
      const winners = new Set(pots.flatMap((p) => p.winners));
      const many = this.showdown.hands.length > 3 ? 'many' : '';
      hands = `<div class="result-hands ${many}">${this.showdown.hands
        .map(
          (h) => `<div class="result-hand ${winners.has(h.playerId) ? 'winner' : ''}">
            <div class="who">${nameOf(h.playerId)}</div>
            <div class="desc">${h.eval.description}</div>
            <div class="cards">${h.eval.best.map((c) => cardHTML(c)).join('')}</div>
          </div>`,
        )
        .join('')}</div>`;
    }

    await showSheet(
      `<p class="result-title ${cls}">${title}</p>
       <p class="result-sub">${sub}</p>
       ${potLines}
       ${this.reviewHTML(net)}
       ${hands}
       <button class="btn btn-primary" data-value="next">次のハンドへ</button>`,
      { container: this.app },
    );
    if (!this.alive) throw new Cancelled();
  }

  /** 自分のチップがなくなったとき。true なら補充して続ける */
  async bustSheet() {
    const v = await showSheet(
      `<p class="result-title lose">チップがなくなりました</p>
       <p class="result-sub">次はきっと勝てる！チップを ${fmt(this.config.startingStack)} 補充して続けられます</p>
       <button class="btn btn-primary" data-value="again">チップを補充して続ける</button>
       <button class="btn" data-value="home">ホームへ</button>`,
      { container: this.app },
    );
    return v === 'again';
  }
}
