// 通常対戦（キャッシュゲーム）の設定画面

import { load, update } from '../store/storage.js';
import { PERSONALITIES, LEVELS } from '../ai/personalities.js';
import { fmt } from './util.js';

const STARTING_STACK = 2000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

const LEVEL_OPTIONS = [
  ...Object.values(LEVELS).map((l) => ({ id: l.id, label: l.label, desc: l.desc })),
  { id: 'mixed', label: 'ミックス', desc: '初級〜上級がランダムに混ざる' },
];

const SPEED_OPTIONS = [
  { id: 'slow', label: 'ゆっくり' },
  { id: 'normal', label: 'ふつう' },
  { id: 'fast', label: 'はやい' },
];

const MODES = {
  cash: { title: '🎰 通常対戦', defaultPlayers: 6, note: '' },
  hint: {
    title: '💡 ヒント付き対戦',
    defaultPlayers: 4,
    note: 'あなたの番になると、勝率とおすすめのアクション・理由が表示されます。ハンドが終わると、あなたの判断を振り返れます。',
  },
};

export function mountSetup(app, { navigate, mode = 'cash' }) {
  const M = MODES[mode];
  const saved = load().settings[mode] || {};
  const state = {
    numPlayers: saved.numPlayers || M.defaultPlayers,
    level: saved.level || 'beginner',
    speed: saved.speed || 'normal',
  };

  const render = () => {
    app.innerHTML = `
      <div class="setup">
        <div class="setup-head">
          <button class="back-btn" data-act="back" aria-label="戻る">‹</button>
          <h2>${M.title}</h2>
        </div>
        ${M.note ? `<p class="page-note">${M.note}</p>` : ''}

        <section class="setup-section">
          <h3>人数（あなたを含む）</h3>
          <div class="segmented" data-group="numPlayers">
            ${[2, 3, 4, 5, 6]
              .map(
                (n) =>
                  `<button class="${state.numPlayers === n ? 'selected' : ''}" data-value="${n}">${n}人${n === 2 ? '<small>1対1</small>' : ''}</button>`,
              )
              .join('')}
          </div>
        </section>

        <section class="setup-section">
          <h3>CPUの強さ</h3>
          <div class="options" data-group="level">
            ${LEVEL_OPTIONS.map(
              (o) =>
                `<button class="option-card ${state.level === o.id ? 'selected' : ''}" data-value="${o.id}">${o.label}<small>${o.desc}</small></button>`,
            ).join('')}
          </div>
        </section>

        <section class="setup-section">
          <h3>進行スピード</h3>
          <div class="segmented" data-group="speed">
            ${SPEED_OPTIONS.map(
              (o) => `<button class="${state.speed === o.id ? 'selected' : ''}" data-value="${o.id}">${o.label}</button>`,
            ).join('')}
          </div>
        </section>

        <section class="setup-section">
          <h3>CPUの性格（席をタップすると確認できます）</h3>
          <div class="type-list">
            ${Object.values(PERSONALITIES)
              .map((p) => `<div class="type-item"><span class="av">${p.avatar}</span><div><b>${p.label}</b>${p.desc}</div></div>`)
              .join('')}
          </div>
        </section>

        <p class="setup-note">持ちチップ ${fmt(STARTING_STACK)}・ブラインド ${SMALL_BLIND}/${BIG_BLIND}<br>チップがなくなっても補充して続けられます</p>
        <button class="btn btn-primary" data-act="start">対戦スタート</button>
      </div>`;
  };

  render();
  app.addEventListener('click', function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const group = btn.closest('[data-group]');
    if (group) {
      const key = group.dataset.group;
      state[key] = key === 'numPlayers' ? Number(btn.dataset.value) : btn.dataset.value;
      render();
      return;
    }
    if (btn.dataset.act === 'back') {
      app.removeEventListener('click', onClick);
      navigate('home');
    } else if (btn.dataset.act === 'start') {
      app.removeEventListener('click', onClick);
      update((d) => {
        d.settings[mode] = { ...state };
      });
      navigate('table', {
        config: { ...state, hints: mode === 'hint', startingStack: STARTING_STACK, smallBlind: SMALL_BLIND, bigBlind: BIG_BLIND },
      });
    }
  });
}
