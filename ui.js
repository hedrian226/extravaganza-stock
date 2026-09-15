/* ui.js — in-page alert/confirm popups styled to match the site,
   used instead of the browser's plain alert()/confirm() boxes. */
const UI = (function () {
  'use strict';

  let overlay, card, titleEl, msgEl, actionsEl;
  let activeResolve = null;

  function ensureBuilt() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'ui-modal-overlay';

    card = document.createElement('div');
    card.className = 'ui-modal-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');

    titleEl = document.createElement('h3');
    titleEl.className = 'ui-modal-title';

    msgEl = document.createElement('p');
    msgEl.className = 'ui-modal-msg';

    actionsEl = document.createElement('div');
    actionsEl.className = 'ui-modal-actions';

    card.appendChild(titleEl);
    card.appendChild(msgEl);
    card.appendChild(actionsEl);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') {
        const btn = actionsEl.querySelector('.ui-modal-confirm');
        if (btn) btn.click();
      }
    });
  }

  function close(result) {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('ui-modal-lock');
    if (activeResolve) {
      const r = activeResolve;
      activeResolve = null;
      r(result);
    }
  }

  function open({ title, message, confirmLabel, cancelLabel, danger }) {
    ensureBuilt();
    titleEl.textContent = title || '';
    titleEl.style.display = title ? '' : 'none';
    msgEl.textContent = message || '';
    actionsEl.innerHTML = '';

    return new Promise((resolve) => {
      activeResolve = resolve;

      if (cancelLabel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn ghost';
        cancelBtn.textContent = cancelLabel;
        cancelBtn.addEventListener('click', () => close(false));
        actionsEl.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'btn primary ui-modal-confirm' + (danger ? ' danger' : '');
      confirmBtn.textContent = confirmLabel || 'OK';
      confirmBtn.addEventListener('click', () => close(true));
      actionsEl.appendChild(confirmBtn);

      overlay.classList.add('open');
      document.body.classList.add('ui-modal-lock');
      setTimeout(() => confirmBtn.focus(), 10);
    });
  }

  return {
    /** Replacement for window.alert(message) */
    alert(message, title) {
      return open({ title, message, confirmLabel: 'OK' });
    },
    /** Replacement for window.confirm(message); resolves true/false */
    confirm(message, { title, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
      return open({ title, message, confirmLabel, cancelLabel, danger });
    },
  };
})();
