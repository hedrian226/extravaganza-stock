/* DotField.js — React Bits "DotField" component.
   Ported to plain React.createElement calls (no JSX/build step needed)
   so it can run via the React/ReactDOM UMD builds already used in this
   project. Exposes itself as window.DotField. */
(function () {
  'use strict';

  var React = window.React;
  var e = React.createElement;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var memo = React.memo;

  var TWO_PI = Math.PI * 2;

  var DotField = memo(function (props) {
    var dotRadius = props.dotRadius !== undefined ? props.dotRadius : 1.5;
    var dotSpacing = props.dotSpacing !== undefined ? props.dotSpacing : 14;
    var cursorRadius = props.cursorRadius !== undefined ? props.cursorRadius : 500;
    var cursorForce = props.cursorForce !== undefined ? props.cursorForce : 0.1;
    var bulgeOnly = props.bulgeOnly !== undefined ? props.bulgeOnly : true;
    var bulgeStrength = props.bulgeStrength !== undefined ? props.bulgeStrength : 67;
    var glowRadius = props.glowRadius !== undefined ? props.glowRadius : 160;
    var sparkle = props.sparkle !== undefined ? props.sparkle : false;
    var waveAmplitude = props.waveAmplitude !== undefined ? props.waveAmplitude : 0;
    var gradientFrom = props.gradientFrom !== undefined ? props.gradientFrom : 'rgba(168, 85, 247, 0.35)';
    var gradientTo = props.gradientTo !== undefined ? props.gradientTo : 'rgba(180, 151, 207, 0.25)';
    var glowColor = props.glowColor !== undefined ? props.glowColor : '#120F17';

    var canvasRef = useRef(null);
    var svgRef = useRef(null);
    var glowRef = useRef(null);
    var dotsRef = useRef([]);
    var mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
    var rafRef = useRef(null);
    var sizeRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
    var glowOpacity = useRef(0);
    var engagement = useRef(0);
    var propsRef = useRef({});
    propsRef.current = {
      dotRadius: dotRadius, dotSpacing: dotSpacing, cursorRadius: cursorRadius,
      cursorForce: cursorForce, bulgeOnly: bulgeOnly, bulgeStrength: bulgeStrength,
      sparkle: sparkle, waveAmplitude: waveAmplitude, gradientFrom: gradientFrom,
      gradientTo: gradientTo
    };
    var rebuildRef = useRef(null);
    var glowIdRef = useRef('dot-field-glow-' + Math.random().toString(36).slice(2, 9));

    useEffect(function () {
      var canvas = canvasRef.current;
      var glowEl = glowRef.current;
      if (!canvas) return;
      var ctx = canvas.getContext('2d', { alpha: true });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var resizeTimer;

      function resize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(doResize, 100);
      }

      function doResize() {
        var rect = canvas.parentElement.getBoundingClientRect();
        var w = rect.width;
        var h = rect.height;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        sizeRef.current = {
          w: w,
          h: h,
          offsetX: rect.left + window.scrollX,
          offsetY: rect.top + window.scrollY
        };

        buildDots(w, h);
      }

      function buildDots(w, h) {
        var p = propsRef.current;
        var step = p.dotRadius + p.dotSpacing;
        var cols = Math.floor(w / step);
        var rows = Math.floor(h / step);
        var padX = (w % step) / 2;
        var padY = (h % step) / 2;
        var dots = new Array(rows * cols);
        var idx = 0;

        for (var row = 0; row < rows; row++) {
          for (var col = 0; col < cols; col++) {
            var ax = padX + col * step + step / 2;
            var ay = padY + row * step + step / 2;
            dots[idx++] = { ax: ax, ay: ay, sx: ax, sy: ay, vx: 0, vy: 0, x: ax, y: ay };
          }
        }
        dotsRef.current = dots;
      }

      function onMouseMove(ev) {
        var s = sizeRef.current;
        mouseRef.current.x = ev.pageX - s.offsetX;
        mouseRef.current.y = ev.pageY - s.offsetY;
      }

      function updateMouseSpeed() {
        var m = mouseRef.current;
        var dx = m.prevX - m.x;
        var dy = m.prevY - m.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        m.speed += (dist - m.speed) * 0.5;
        if (m.speed < 0.001) m.speed = 0;
        m.prevX = m.x;
        m.prevY = m.y;
      }

      var speedInterval = setInterval(updateMouseSpeed, 20);

      var frameCount = 0;

      function tick() {
        frameCount++;
        var dots = dotsRef.current;
        var m = mouseRef.current;
        var size = sizeRef.current;
        var w = size.w, h = size.h;
        var p = propsRef.current;
        var len = dots.length;
        var t = frameCount * 0.02;

        var targetEngagement = Math.min(m.speed / 5, 1);
        engagement.current += (targetEngagement - engagement.current) * 0.06;
        if (engagement.current < 0.001) engagement.current = 0;
        var eng = engagement.current;

        glowOpacity.current += (eng - glowOpacity.current) * 0.08;

        if (glowEl) {
          glowEl.setAttribute('cx', m.x);
          glowEl.setAttribute('cy', m.y);
          glowEl.style.opacity = glowOpacity.current;
        }

        ctx.clearRect(0, 0, w, h);

        var grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, p.gradientFrom);
        grad.addColorStop(1, p.gradientTo);
        ctx.fillStyle = grad;

        var cr = p.cursorRadius;
        var crSq = cr * cr;
        var rad = p.dotRadius / 2;
        var isBulge = p.bulgeOnly;

        ctx.beginPath();

        for (var i = 0; i < len; i++) {
          var d = dots[i];
          var dx = m.x - d.ax;
          var dy = m.y - d.ay;
          var distSq = dx * dx + dy * dy;

          if (distSq < crSq && eng > 0.01) {
            var dist = Math.sqrt(distSq);
            if (isBulge) {
              var tt = 1 - dist / cr;
              var push = tt * tt * p.bulgeStrength * eng;
              var angle = Math.atan2(dy, dx);
              d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
              d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
            } else {
              var angle2 = Math.atan2(dy, dx);
              var move = (500 / dist) * (m.speed * p.cursorForce);
              d.vx += Math.cos(angle2) * -move;
              d.vy += Math.sin(angle2) * -move;
            }
          } else if (isBulge) {
            d.sx += (d.ax - d.sx) * 0.1;
            d.sy += (d.ay - d.sy) * 0.1;
          }

          if (!isBulge) {
            d.vx *= 0.9;
            d.vy *= 0.9;
            d.x = d.ax + d.vx;
            d.y = d.ay + d.vy;
            d.sx += (d.x - d.sx) * 0.1;
            d.sy += (d.y - d.sy) * 0.1;
          }

          var drawX = d.sx;
          var drawY = d.sy;
          if (p.waveAmplitude > 0) {
            drawY += Math.sin(d.ax * 0.03 + t) * p.waveAmplitude;
            drawX += Math.cos(d.ay * 0.03 + t * 0.7) * p.waveAmplitude * 0.5;
          }

          if (p.sparkle) {
            var hash = ((i * 2654435761) ^ (frameCount >> 3)) >>> 0;
            if ((hash % 100) < 3) {
              ctx.moveTo(drawX + rad * 1.8, drawY);
              ctx.arc(drawX, drawY, rad * 1.8, 0, TWO_PI);
            } else {
              ctx.moveTo(drawX + rad, drawY);
              ctx.arc(drawX, drawY, rad, 0, TWO_PI);
            }
          } else {
            ctx.moveTo(drawX + rad, drawY);
            ctx.arc(drawX, drawY, rad, 0, TWO_PI);
          }
        }

        ctx.fill();

        rafRef.current = requestAnimationFrame(tick);
      }

      doResize();
      window.addEventListener('resize', resize);
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      rafRef.current = requestAnimationFrame(tick);

      rebuildRef.current = function () {
        var s = sizeRef.current;
        if (s.w > 0 && s.h > 0) buildDots(s.w, s.h);
      };

      return function () {
        cancelAnimationFrame(rafRef.current);
        clearInterval(speedInterval);
        clearTimeout(resizeTimer);
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', onMouseMove);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(function () {
      if (rebuildRef.current) rebuildRef.current();
    }, [dotRadius, dotSpacing]);

    return e(
      'div',
      { className: 'dot-field-container' },
      e('canvas', {
        ref: canvasRef,
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%' }
      }),
      e(
        'svg',
        {
          ref: svgRef,
          style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }
        },
        e(
          'defs',
          null,
          e(
            'radialGradient',
            { id: glowIdRef.current },
            e('stop', { offset: '0%', stopColor: glowColor }),
            e('stop', { offset: '100%', stopColor: 'transparent' })
          )
        ),
        e('circle', {
          ref: glowRef,
          cx: '-9999',
          cy: '-9999',
          r: glowRadius,
          fill: 'url(#' + glowIdRef.current + ')',
          style: { opacity: 0, willChange: 'opacity' }
        })
      )
    );
  });

  DotField.displayName = 'DotField';

  window.DotField = DotField;
})();
