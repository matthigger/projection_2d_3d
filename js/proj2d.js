/* 2D demo: project b onto the line spanned by a. Drag either tip. */
(function () {
  "use strict";
  const { V, color, svgEl, fmt, fmtVec, chip, drawArrow, drawHalo,
    drawLabels, localPoint } = window.Proj;

  // Half-width, in world units, of the square that always stays visible.
  const R = 6;
  const DEFAULTS = { a: [4, 4], b: [-4, 2] };

  const svg = document.getElementById("svg2d");
  const readout = document.getElementById("readout2d");
  const optSnap = document.getElementById("snap2d");
  const optSpan = document.getElementById("span2d");
  const optVals = document.getElementById("vals2d");

  const state = { a: [...DEFAULTS.a], b: [...DEFAULTS.b] };
  let drag = null;
  let hover = null;
  let view = { W: 0, H: 0, cx: 0, cy: 0, s: 1 };

  const toScreen = (v) => [view.cx + v[0] * view.s, view.cy - v[1] * view.s];
  const toWorld = (px, py) => [(px - view.cx) / view.s,
    (view.cy - py) / view.s];

  /**
   * Project b onto span(a).
   *
   * Returns:
   *   null if a = 0, else {aa, ab, c, p, e} with c = a.b / a.a, p = c a,
   *   e = b - p
   */
  function project(a, b) {
    const aa = V.dot(a, a);
    if (aa < 1e-9) return null;
    const ab = V.dot(a, b);
    const c = ab / aa;
    const p = V.scale(a, c);
    return { aa, ab, c, p, e: V.sub(b, p) };
  }

  function drawGrid(g) {
    const { W, H } = view;
    const [x0, y1] = toWorld(0, 0);
    const [x1, y0] = toWorld(W, H);
    for (let x = Math.ceil(x0); x <= x1; x++) {
      const X = toScreen([x, 0])[0];
      svgEl("line", { x1: X, y1: 0, x2: X, y2: H, class: "grid" }, g);
    }
    for (let y = Math.ceil(y0); y <= y1; y++) {
      const Y = toScreen([0, y])[1];
      svgEl("line", { x1: 0, y1: Y, x2: W, y2: Y, class: "grid" }, g);
    }
    svgEl("line", { x1: 0, y1: view.cy, x2: W, y2: view.cy, class: "axis" }, g);
    svgEl("line", { x1: view.cx, y1: 0, x2: view.cx, y2: H, class: "axis" }, g);
    for (let x = Math.ceil(x0 / 2) * 2; x <= x1; x += 2) {
      if (x === 0) continue;
      const t = svgEl("text", {
        x: toScreen([x, 0])[0], y: view.cy + 16, class: "tick",
        "text-anchor": "middle",
      }, g);
      t.textContent = fmt(x);
    }
    for (let y = Math.ceil(y0 / 2) * 2; y <= y1; y += 2) {
      if (y === 0) continue;
      const t = svgEl("text", {
        x: view.cx - 8, y: toScreen([0, y])[1] + 4, class: "tick",
        "text-anchor": "end",
      }, g);
      t.textContent = fmt(y);
    }
  }

  function drawSpan(g, a) {
    const u = V.unit(a);
    const far = (view.W + view.H) / view.s;
    const P0 = toScreen(V.scale(u, -far)), P1 = toScreen(V.scale(u, far));
    svgEl("line", {
      x1: P0[0], y1: P0[1], x2: P1[0], y2: P1[1], class: "span-line",
    }, g);

    // Put the "span(a)" tag where the line leaves the view, on the side
    // a points to.
    const m = 46;
    const tx = u[0] ? ((u[0] > 0 ? view.W - m : m) - view.cx) /
      (u[0] * view.s) : Infinity;
    const ty = u[1] ? ((u[1] > 0 ? m - 10 : view.H - m) - view.cy) /
      (-u[1] * view.s) : Infinity;
    const [X, Y] = toScreen(V.scale(u, Math.min(tx, ty)));
    let ang = Math.atan2(-u[1], u[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180;
    else if (ang < -90) ang += 180;
    const t = svgEl("text", {
      x: 0, y: -8, class: "span-label", "text-anchor": "middle",
      transform: `translate(${X},${Y}) rotate(${ang})`,
    }, g);
    t.textContent = "span(a)";
  }

  function drawRightAngle(g, p, e) {
    const en = V.norm(e), pn = V.norm(p);
    if (en < 1e-6) return;
    let k = 0.38;
    k = Math.min(k, en * 0.45);
    if (pn > 1e-6) k = Math.min(k, pn * 0.45);
    const u = pn > 1e-6 ? V.scale(p, -1 / pn) : V.unit(state.a);
    const w = V.scale(e, 1 / en);
    const pts = [
      V.add(p, V.scale(u, k)),
      V.add(p, V.add(V.scale(u, k), V.scale(w, k))),
      V.add(p, V.scale(w, k)),
    ].map(toScreen);
    svgEl("polyline", {
      points: pts.map((q) => q.join(",")).join(" "), class: "right-angle",
    }, g);
  }

  function render() {
    if (!view.W) return;
    svg.replaceChildren();
    const g = svgEl("g", {}, svg);
    drawGrid(g);

    const { a, b } = state;
    const pr = project(a, b);
    const col = { a: color("a"), b: color("b"), p: color("p"),
      e: color("e") };
    const O = toScreen([0, 0]);
    const A = toScreen(a), Bs = toScreen(b);
    const withVals = optVals.checked;
    const lab = (name, v) => (withVals ? `${name} = ${fmtVec(v)}` : name);

    if (optSpan.checked && pr) drawSpan(g, a);
    drawHalo(g, A, col.a, hover === "a" || drag === "a");
    drawHalo(g, Bs, col.b, hover === "b" || drag === "b");

    const labels = [];
    labels.push({ text: lab("b", b), color: col.b, p0: O, p1: Bs });
    if (pr) {
      const Ps = toScreen(pr.p);
      drawRightAngle(g, pr.p, pr.e);
      // p is collinear with a: draw it wide underneath so both stay
      // visible where they overlap.
      drawArrow(g, O, Ps, col.p, { width: 8, head: 19 });
      drawArrow(g, O, A, col.a, { width: 3.2 });
      drawArrow(g, Ps, Bs, col.e, { width: 3.2 });
      labels.push({ text: lab("e", pr.e), color: col.e, p0: Ps, p1: Bs });
      labels.push({ text: lab("p", pr.p), color: col.p, p0: O, p1: Ps });
    } else {
      drawArrow(g, O, A, col.a, { width: 3.2 });
    }
    drawArrow(g, O, Bs, col.b, { width: 3.2 });
    labels.push({ text: lab("a", a), color: col.a, p0: O, p1: A });
    svgEl("circle", { cx: O[0], cy: O[1], r: 3.5, class: "origin" }, g);
    drawLabels(svgEl("g", {}, svg), labels, view);
    updateReadout(pr);
  }

  function updateReadout(pr) {
    const a = chip("a", "a"), b = chip("b", "b"), p = chip("p", "p"),
      e = chip("e", "e");
    if (!pr) {
      readout.innerHTML = `<h3>Live numbers</h3><p class="warn">${a} = 0
        spans only the origin &mdash; drag ${a} away from 0.</p>`;
      return;
    }
    const ae = V.dot(state.a, pr.e);
    const row = (k, v) => `<div class="row"><span>${k}</span>
      <span class="val">${v}</span></div>`;
    readout.innerHTML = "<h3>Live numbers</h3>" +
      row(`${a} &middot; ${b}`, fmt(pr.ab)) +
      row(`${a} &middot; ${a}`, fmt(pr.aa)) +
      row(`<i>c</i> = <span class="frac"><span>${a}&middot;${b}</span>
        <span>${a}&middot;${a}</span></span>`, fmt(pr.c, 3)) +
      row(`${p} = <i>c</i> ${a}`, fmtVec(pr.p)) +
      row(`${e} = ${b} &minus; ${p}`, fmtVec(pr.e)) +
      row(`${a} &middot; ${e}`,
        `${fmt(ae)} <span class="ok">&perp; &check;</span>`) +
      row(`&Vert;${e}&Vert; <span class="muted">(distance to line)</span>`,
        fmt(V.norm(pr.e)));
  }

  function nearestTip(px, py) {
    let best = null, bestD = 24;
    for (const k of ["b", "a"]) {
      const [X, Y] = toScreen(state[k]);
      const d = Math.hypot(X - px, Y - py);
      if (d < bestD) { best = k; bestD = d; }
    }
    return best;
  }

  function moveTip(k, px, py) {
    const [x0, y1] = toWorld(12, 12);
    const [x1, y0] = toWorld(view.W - 12, view.H - 12);
    let w = toWorld(px, py);
    w = [Math.min(Math.max(w[0], x0), x1), Math.min(Math.max(w[1], y0), y1)];
    const step = optSnap.checked ? 1 : 0.01;
    w = w.map((x) => Math.round(x / step) * step);
    if (k === "a" && V.norm(w) < 1e-9) return;
    state[k] = w;
    render();
  }

  svg.addEventListener("pointerdown", (ev) => {
    const [px, py] = localPoint(svg, ev);
    const k = nearestTip(px, py);
    if (!k) return;
    drag = k;
    svg.setPointerCapture(ev.pointerId);
    svg.style.cursor = "grabbing";
    moveTip(k, px, py);
    ev.preventDefault();
  });

  svg.addEventListener("pointermove", (ev) => {
    const [px, py] = localPoint(svg, ev);
    if (drag) { moveTip(drag, px, py); return; }
    const k = nearestTip(px, py);
    if (k !== hover) {
      hover = k;
      svg.style.cursor = k ? "grab" : "default";
      render();
    }
  });

  const endDrag = () => {
    drag = null;
    svg.style.cursor = hover ? "grab" : "default";
    render();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => {
    if (!drag && hover) { hover = null; render(); }
  });

  [optSpan, optVals].forEach((o) => o.addEventListener("change", render));
  optSnap.addEventListener("change", () => {
    if (optSnap.checked) {
      state.a = state.a.map(Math.round);
      state.b = state.b.map(Math.round);
      if (V.norm(state.a) < 1e-9) state.a = [...DEFAULTS.a];
    }
    render();
  });
  document.getElementById("reset2d").addEventListener("click", () => {
    state.a = [...DEFAULTS.a];
    state.b = [...DEFAULTS.b];
    render();
  });

  new ResizeObserver(() => {
    const W = svg.clientWidth, H = svg.clientHeight;
    view = { W, H, cx: W / 2, cy: H / 2, s: Math.min(W, H) / (2 * R + 1) };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    render();
  }).observe(svg);
})();
