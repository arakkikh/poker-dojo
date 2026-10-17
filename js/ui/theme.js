// 見た目の設定（カードの裏デザイン）を画面に反映する

import { load } from '../store/storage.js';

export function applyCardBack() {
  document.body.dataset.back = load().profile.cardBack || 'red';
}
