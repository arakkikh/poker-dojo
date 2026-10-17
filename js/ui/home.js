// ホーム画面

import { load, resetAll } from '../store/storage.js';
import { fmt } from './util.js';

const MENU = [
  { id: 'lesson', icon: '📘', title: '入門レッスン', sub: '役・流れ・ポジションを基礎から', ready: true, featured: true },
  { id: 'drill', icon: '🎯', title: '練習ドリル', sub: 'クイズで判断力をきたえる', ready: true },
  { id: 'hint', icon: '💡', title: 'ヒント付き対戦', sub: '勝率とおすすめアクションを表示', ready: true },
  { id: 'cash', icon: '🎰', title: '通常対戦', sub: '2〜6人・CPUの強さと性格いろいろ', ready: true },
  { id: 'tournament', icon: '🏆', title: 'トーナメント', sub: 'ブラインドが上がっていく勝ち抜き戦', ready: true },
  { id: 'mission', icon: '⭐', title: 'ミッション', sub: '目標をクリアしてコインをゲット', ready: true },
  { id: 'stats', icon: '📊', title: '成績・図鑑', sub: '統計と達成した役のコレクション', ready: true },
];

export function mountHome(app, { navigate }) {
  const { stats, profile, progress } = load();
  const unclaimed = Object.values(progress.missions).filter((m) => !m.claimed).length;
  const winRate = stats.hands ? Math.round((stats.handsWon / stats.hands) * 100) + '%' : '-';

  app.innerHTML = `
    <div class="home">
      <div class="home-suits">♠<span class="r">♥</span>♣<span class="r">♦</span></div>
      <h1 class="home-title">ポーカー道場</h1>
      <p class="home-sub">テキサスホールデムを基礎から学ぼう</p>
      <div class="home-coins"><span class="coin-pill">🪙 ${fmt(profile.coins)} コイン</span>${unclaimed ? `<span class="badge-new">受け取れる報酬 ${unclaimed}</span>` : ''}</div>
      <div class="stats-strip">
        <div class="stat"><b>${fmt(stats.hands)}</b><span>プレイしたハンド</span></div>
        <div class="stat"><b>${winRate}</b><span>ポット獲得率</span></div>
        <div class="stat"><b>${fmt(stats.biggestPot)}</b><span>最大獲得ポット</span></div>
      </div>
      <nav class="menu">
        ${MENU.map(
          (m) => `
          <button class="menu-item ${m.featured ? 'featured' : ''}" data-id="${m.id}" ${m.ready ? '' : 'disabled'}>
            <span class="icon">${m.icon}</span>
            <span class="label"><b>${m.title}</b><small>${m.sub}</small></span>
            ${m.ready ? '<span aria-hidden="true">›</span>' : '<span class="badge-soon">準備中</span>'}
          </button>`,
        ).join('')}
      </nav>
      <div class="home-footer">
        <button class="link-btn" data-action="reset">データをリセット</button>
      </div>
    </div>`;

  app.querySelector('.menu').addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (item && !item.disabled) navigate(item.dataset.id);
  });
  app.querySelector('[data-action="reset"]').addEventListener('click', () => {
    if (confirm('成績・図鑑・レッスンの進み具合・ミッション・コインをすべてリセットします。元に戻せません。よろしいですか？')) {
      resetAll();
      mountHome(app, { navigate });
    }
  });
}
