// ミッション画面（報酬の受け取りと、カードの裏デザインの交換）

import { MISSIONS, CARD_BACKS } from '../content/missions.js';
import { load, claimMission, buyCardBack, setCardBack } from '../store/storage.js';
import { applyCardBack } from './theme.js';
import { toast } from './util.js';

export function mountMissions(app, { navigate }) {
  function render() {
    const data = load();
    const st = data.progress.missions;
    const order = (m) => (st[m.id] && !st[m.id].claimed ? 0 : !st[m.id] ? 1 : 2);
    const list = [...MISSIONS].sort((a, b) => order(a) - order(b));
    const doneCount = MISSIONS.filter((m) => st[m.id]).length;
    const { coins, cardBacks, cardBack } = data.profile;

    app.innerHTML = `
      <div class="page">
        <div class="setup-head">
          <button class="back-btn" data-act="home" aria-label="戻る">‹</button>
          <h2>⭐ ミッション</h2>
          <span class="coin-pill">🪙 ${coins}</span>
        </div>
        <div class="progress-line"><div style="width:${(doneCount / MISSIONS.length) * 100}%"></div></div>
        <p class="page-note">${doneCount} / ${MISSIONS.length} 達成。ミッションはどのモードで遊んでも進みます</p>
        <div class="mission-list">
          ${list
            .map((m) => {
              const s = st[m.id];
              let right;
              if (!s) right = `<span class="reward">🪙 ${m.reward}</span>`;
              else if (!s.claimed) right = `<button class="btn btn-primary claim" data-claim="${m.id}">受け取る<br><small>🪙 ${m.reward}</small></button>`;
              else right = '<span class="badge-done">✓ 受取済</span>';
              return `<div class="mission ${s ? (s.claimed ? 'claimed' : 'ready') : ''}">
                <span class="icon">${m.icon}</span>
                <div class="label"><b>${m.title}</b><small>${m.desc}</small></div>
                ${right}
              </div>`;
            })
            .join('')}
        </div>

        <h3 class="section-title">🎁 ごほうび交換：カードの裏デザイン</h3>
        <div class="backs">
          ${CARD_BACKS.map((b) => {
            const owned = cardBacks.includes(b.id);
            const using = cardBack === b.id;
            let btn;
            if (using) btn = '<span class="badge-done">使用中</span>';
            else if (owned) btn = `<button class="btn small" data-use="${b.id}">使う</button>`;
            else btn = `<button class="btn small" data-buy="${b.id}" ${coins < b.price ? 'disabled' : ''}>🪙 ${b.price}</button>`;
            return `<div class="back-item ${using ? 'using' : ''}">
              <div class="card back" data-back="${b.id}"></div>
              <small>${b.label}</small>
              ${btn}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'home') {
      navigate('home');
      return;
    }
    if (t.dataset.claim) {
      const got = claimMission(t.dataset.claim);
      if (got) toast(`🪙 ${got} コインを受け取りました！`);
    } else if (t.dataset.buy) {
      if (buyCardBack(t.dataset.buy)) toast('新しいカードの裏デザインを手に入れました！');
    } else if (t.dataset.use) {
      setCardBack(t.dataset.use);
    } else return;
    applyCardBack();
    render();
  });

  render();
}
