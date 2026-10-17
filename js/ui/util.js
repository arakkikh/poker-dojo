export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function toast(message, ms = 2400) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
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
