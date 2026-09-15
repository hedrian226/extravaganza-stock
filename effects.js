/* effects.js — lightweight visual polish, mobile-safe by design.
   No animation loops, no backdrop-filter, no blur. Spotlight hover
   is only ever attached on devices with a fine pointer + hover
   (i.e. never on touch/mobile), so it costs nothing there. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---- staggered fade-in for stock cards as they render ---- */
  function revealNew(nodes) {
    if (reduceMotion) {
      nodes.forEach(function (n) { n.classList.add('reveal-in'); });
      return;
    }
    nodes.forEach(function (n, i) {
      var delay = Math.min(i, 10) * 40; // cap stagger so long lists don't queue forever
      setTimeout(function () { n.classList.add('reveal-in'); }, delay);
    });
  }

  function watchGrid() {
    var grid = document.getElementById('stock-grid');
    if (!grid) return;

    revealNew(Array.prototype.slice.call(grid.querySelectorAll('.item-card:not(.reveal-in)')));

    var mo = new MutationObserver(function () {
      var fresh = Array.prototype.slice.call(grid.querySelectorAll('.item-card:not(.reveal-in)'));
      if (fresh.length) revealNew(fresh);
    });
    mo.observe(grid, { childList: true });
  }

  /* ---- cursor-spotlight on cards, desktop/fine-pointer ONLY ---- */
  function initSpotlight() {
    if (!canHover || reduceMotion) return; // never runs on mobile
    document.body.classList.add('spotlight-enabled');
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest('.item-card, .auth-card');
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  function boot() {
    watchGrid();
    initSpotlight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
