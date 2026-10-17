// 起動と画面の切り替え

import { mountHome } from './ui/home.js';
import { mountSetup } from './ui/setup.js';
import { mountTable } from './ui/table.js';
import { mountLesson } from './ui/lesson.js';
import { mountDrill } from './ui/drill.js';
import { mountMissions } from './ui/missions.js';
import { mountStats } from './ui/stats.js';
import { applyCardBack } from './ui/theme.js';

let current = document.getElementById('app');
let unmount = null;

const SCREENS = {
  home: mountHome,
  cash: mountSetup,
  hint: (el, ctx) => mountSetup(el, { ...ctx, mode: 'hint' }),
  tournament: (el, ctx) => mountSetup(el, { ...ctx, mode: 'tournament' }),
  lesson: mountLesson,
  drill: mountDrill,
  mission: mountMissions,
  stats: mountStats,
  table: mountTable,
};

function navigate(name, params = {}) {
  if (unmount) unmount();
  unmount = null;
  // 画面ごとのイベントリスナーを残さないよう、#app を作り直す
  const fresh = current.cloneNode(false);
  current.replaceWith(fresh);
  current = fresh;
  window.scrollTo(0, 0);
  const mount = SCREENS[name] || SCREENS.home;
  unmount = mount(fresh, { navigate, ...params }) || null;
}

applyCardBack();
navigate('home');

// オフラインでも遊べるように（https または localhost のときだけ）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
