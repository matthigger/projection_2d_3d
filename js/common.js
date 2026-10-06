/* Shared helpers: vector math, SVG construction, arrows, on-arrow labels. */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, ' +
    '"Helvetica Neue", sans-serif';

  const V = {
    add: (u, v) => u.map((x, i) => x + v[i]),
    sub: (u, v) => u.map((x, i) => x - v[i]),
    scale: (u, s) => u.map((x) => x * s),
    dot: (u, v) => u.reduce((acc, x, i) => acc + x * v[i], 0),
    norm: (u) => Math.hypot(...u),
    cross: (u, v) => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ],
    unit: (u) => {
      const n = Math.hypot(...u);
      return n > 1e-12 ? u.map((x) => x / n) : u.map(() => 0);
    },
  };

  /** Read a vector colour (--c-<name>) from the stylesheet. */
  function color(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--c-" + name).trim();
  }

  function svgEl(tag, attrs = {}, parent = null) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Round for display, with a true minus sign and no "-0". */
  function fmt(x, digits = 2) {
    const p = 10 ** digits;
    let r = Math.round(x * p) / p;
    if (Math.abs(r) < 0.5 / p) r = 0;
    return String(r).replace("-", "−");
  }

  function fmtVec(v, digits = 2) {
    return "(" + v.map((x) => fmt(x, digits)).join(", ") + ")";
  }

  /** HTML colour chip naming a vector, matching its on-canvas label. */
  function chip(cls, text) {
    return `<span class="chip ${cls}">${text}</span>`;
  }

  /**
   * Draw an arrow between two screen points.
   *
   * Args:
   *   g (SVGElement): parent group
   *   p0, p1 (number[]): [x, y] screen coordinates of tail and tip
   *   col (string): stroke / fill colour
   *   opts.width (number): shaft width in px
   *   opts.head (number): arrowhead length in px (shrinks on short arrows)
   *   opts.dash (string?): stroke-dasharray for the shaft
   */
  function drawArrow(g, p0, p1, col, opts = {}) {
    const { width = 3, head = 14, dash = null, opacity = 1 } = opts;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len, uy = dy / len;
    const h = Math.min(head, len * 0.6);
    const hw = h * 0.42 + width * 0.35;
    const bx = p1[0] - ux * h, by = p1[1] - uy * h;
    const attrs = {
      x1: p0[0], y1: p0[1], x2: bx + ux, y2: by + uy,
      stroke: col, "stroke-width": width, "stroke-linecap": "round",
      opacity,
    };
    if (dash) attrs["stroke-dasharray"] = dash;
    svgEl("line", attrs, g);
    svgEl("path", {
      d: `M${p1[0]},${p1[1]} L${bx - uy * hw},${by + ux * hw} ` +
        `L${bx + uy * hw},${by - ux * hw} Z`,
      fill: col, stroke: col, "stroke-width": 1,
      "stroke-linejoin": "round", opacity,
    }, g);
  }

  /** Draw the translucent disc marking a draggable tip. */
  function drawHalo(g, pt, col, active) {
    svgEl("circle", {
      cx: pt[0], cy: pt[1], r: active ? 17 : 15,
      fill: col, "fill-opacity": active ? 0.26 : 0.13,
      stroke: col, "stroke-opacity": 0.45, "stroke-width": 1,
    }, g);
  }

  const measureCtx = document.createElement("canvas").getContext("2d");

  function textWidth(text, size) {
    measureCtx.font = `650 ${size}px ${FONT}`;
    return measureCtx.measureText(text).width;
  }

  function segPointDist(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const L = abx * abx + aby * aby;
    let t = L ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby);
  }

  function orient(a, b, c) {
    return Math.sign((b[0] - a[0]) * (c[1] - a[1]) -
      (b[1] - a[1]) * (c[0] - a[0]));
  }

  function segSegDist(a, b, c, d) {
    if (orient(a, b, c) !== orient(a, b, d) &&
        orient(c, d, a) !== orient(c, d, b)) return 0;
    return Math.min(segPointDist(a, c, d), segPointDist(b, c, d),
      segPointDist(c, a, b), segPointDist(d, a, b));
  }

  const T_CANDIDATES = [0.5, 0.36, 0.64, 0.26, 0.74, 0.18, 0.82];

  /**
   * Draw name/value pills on top of arrows, avoiding overlaps.
   *
   * Labels are placed greedily in list order (earlier = higher priority).
   * Each pill sits on its arrow's shaft, rotated to follow it and kept
   * upright; the first candidate position along the shaft that clears
   * every already-placed pill wins. Arrows too short to hold their pill
   * get it just past the tip instead.
   *
   * Args:
   *   g (SVGElement): parent group, drawn above all arrows
   *   labels (object[]): {text, color, p0, p1, outline?, small?}; p0/p1
   *     are the arrow's screen tail and tip
   *   bounds (object): {W, H} of the drawing, to keep pills on screen
   */
  function drawLabels(g, labels, bounds) {
    const placed = [];
    for (const L of labels) {
      const size = L.small ? 12 : 13.5;
      const h = L.small ? 20 : 24;
      const w = textWidth(L.text, size) + (L.small ? 14 : 18);
      const dx = L.p1[0] - L.p0[0], dy = L.p1[1] - L.p0[1];
      const len = Math.hypot(dx, dy);
      const ux = len ? dx / len : 1, uy = len ? dy / len : 0;

      const cands = [];
      // Leave room for the arrowhead so the pill never covers it.
      const room = len - 16;
      if (room > w + 6) {
        let ang = Math.atan2(dy, dx);
        if (ang > Math.PI / 2) ang -= Math.PI;
        else if (ang < -Math.PI / 2) ang += Math.PI;
        for (const t of T_CANDIDATES) {
          const d = Math.min(Math.max(t * len, w / 2 + 3), room - w / 2);
          cands.push({ cx: L.p0[0] + ux * d, cy: L.p0[1] + uy * d, ang });
        }
      }
      const off = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2 + 10;
      cands.push({ cx: L.p1[0] + ux * off, cy: L.p1[1] + uy * off, ang: 0 });
      cands.push({
        cx: L.p1[0] - uy * (h / 2 + 8), cy: L.p1[1] + ux * (h / 2 + 8),
        ang: 0,
      });

      let best = null, bestClear = -Infinity;
      for (const c of cands) {
        const hx = Math.cos(c.ang) * (w - h) / 2;
        const hy = Math.sin(c.ang) * (w - h) / 2;
        const seg = [[c.cx - hx, c.cy - hy], [c.cx + hx, c.cy + hy]];
        let clear = Infinity;
        for (const q of placed) {
          clear = Math.min(clear,
            segSegDist(seg[0], seg[1], q.seg[0], q.seg[1]) - (h + q.h) / 2);
        }
        const inside = c.cx - w / 2 > 2 && c.cx + w / 2 < bounds.W - 2 &&
          c.cy - h / 2 > 2 && c.cy + h / 2 < bounds.H - 2;
        if (!inside) clear -= 1000;
        if (clear >= 4) { best = { ...c, seg }; break; }
        if (clear > bestClear) { bestClear = clear; best = { ...c, seg }; }
      }
      placed.push({ seg: best.seg, h });

      const gp = svgEl("g", {
        transform: `translate(${best.cx},${best.cy}) ` +
          `rotate(${best.ang * 180 / Math.PI})`,
      }, g);
      svgEl("rect", {
        x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2,
        fill: L.outline ? "#fff" : L.color,
        stroke: L.outline ? L.color : "#fff",
        "stroke-width": L.outline ? 1.5 : 2,
      }, gp);
      const t = svgEl("text", {
        x: 0, y: 0, dy: "0.35em", "text-anchor": "middle",
        fill: L.outline ? L.color : "#fff",
        style: `font: 650 ${size}px ${FONT}`,
      }, gp);
      t.textContent = L.text;
    }
  }

  /** Pointer position relative to an element's top-left corner. */
  function localPoint(el, ev) {
    const r = el.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  // BUILD comes from js/version.js, which the Pages workflow stamps at deploy
  const build = document.getElementById("build");
  if (BUILD) {
    const when = new Date(BUILD.time).toLocaleString("en-US",
      { dateStyle: "medium", timeStyle: "short" });
    const href = "https://github.com/matthigger/projection_2d_3d/commit/" +
      BUILD.sha;
    build.innerHTML =
      `build <a href="${href}">${BUILD.sha.slice(0, 7)}</a>, ${when}`;
  } else {
    build.textContent = "local copy";
  }

  window.Proj = {
    V, color, svgEl, fmt, fmtVec, chip, drawArrow, drawHalo, drawLabels,
    localPoint,
  };
})();
