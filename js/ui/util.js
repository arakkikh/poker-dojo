export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function toast(message, ms = 2400) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** ミッション達成のお知らせ */
export function notifyMissions(missions) {
  for (const m of missions) toast(`⭐ ミッション達成！${m.icon}「${m.title}」\n報酬 ${m.reward} コインはミッション画面で受け取れます`, 4000);
}

/** 下から出るシートを表示し、ボタンが押されたらその value で resolve */
export function showSheet(html, { container = document.body } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="sheet">${html}</div>`;
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn) return;
      overlay.remove();
      resolve(btn.dataset.value);
    });
    container.appendChild(overlay);
  });
}
