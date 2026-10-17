// トランプの描画

import { rankOf, suitOf, isRed, RANK_LABELS, SUIT_SYMBOLS } from '../core/cards.js';

export function cardHTML(c, extraClass = '') {
  const rank = RANK_LABELS[rankOf(c)];
  const suit = SUIT_SYMBOLS[suitOf(c)];
  const cls = ['card', isRed(c) ? 'red' : '', extraClass].filter(Boolean).join(' ');
  return `<div class="${cls}" aria-label="${suit}${rank}"><span class="rank">${rank}</span><span class="suit-small">${suit}</span><span class="suit-big">${suit}</span></div>`;
}

export const backHTML = (extraClass = '') => `<div class="card back ${extraClass}" aria-label="伏せたカード"></div>`;
export const emptyHTML = () => `<div class="card empty"></div>`;
