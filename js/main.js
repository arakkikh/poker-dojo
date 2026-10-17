// 起動と画面の切り替え

import { mountHome } from './ui/home.js';
import { mountSetup } from './ui/setup.js';
import { mountTable } from './ui/table.js';

let current = document.getElementById('app');
let unmount = null;

const SCREENS = {
  home: mountHome,
  cash: mountSetup,
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

navigate('home');
