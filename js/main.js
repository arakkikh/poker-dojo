// 起動と画面の切り替え

import { mountHome } from './ui/home.js';
import { mountTable } from './ui/table.js';

const app = document.getElementById('app');
let unmount = null;

const SCREENS = {
  home: mountHome,
  headsup: (el, ctx) =>
    mountTable(el, {
      ...ctx,
      config: {
        startingStack: 2000,
        smallBlind: 10,
        bigBlind: 20,
        cpus: [{ id: 'cpu1', name: 'タケシ', avatar: '🐣', style: '初級・素直' }],
      },
    }),
};

function navigate(name) {
  if (unmount) unmount();
  unmount = null;
  app.innerHTML = '';
  window.scrollTo(0, 0);
  const mount = SCREENS[name] || SCREENS.home;
  unmount = mount(app, { navigate }) || null;
}

navigate('home');
