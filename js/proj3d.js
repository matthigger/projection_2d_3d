/*
 * 3D demo: project b onto the plane spanned by a1 and a2.
 *
 * Drag empty space to orbit the camera, drag a vector tip to move that
 * vector parallel to the screen, scroll to zoom. The scene is drawn back to
 * front in layers around the translucent plane: every arrow either starts at
 * the origin (which lies in the plane) or, for e, starts on the plane, so
 * each one sits wholly on one side of it and a per-arrow layer is exact.
 */
(function () {
  "use strict";
  const { V, color, svgEl, fmt, fmtVec, chip, drawArrow, drawHalo,
    drawLabels, localPoint } = window.Proj;

  const DEFAULTS = { a1: [4, 0, -1], a2: [0, 4, -1], b: [-2, 4, 4] };
  const DEFAULT_CAM = { theta: 0.8, phi: 0.45, zoom: 1 };
  const KEYS = ["a1", "a2", "b"];
  const NAMES = { a1: "a₁", a2: "a₂", b: "b" };

  const svg = document.getElementById("svg3d");
  const readout = document.getElementById("readout3d");
  const inputsEl = document.getElementById("inputs3d");
  const optCoef = document.getElementById("coef3d");
  const optVals = document.getElementById("vals3d");
  const optSpin = document.getElementById("spin3d");

  const state = {};
  const cam = { ...DEFAULT_CAM };
  // World-space radius the scene is scaled to fit; refit only between
  // drags so the view does not rescale under the pointer.
  let extent = 5;
  let scale = 1;
  let tips = {};
  let drag = null;
  let hover = null;
  let tween = null;

  function setVectors(v) {
    for (const k of KEYS) state[k] = [...v[k]];
  }

  function fitExtent() {
    extent = Math.max(3, ...KEYS.map((k) => V.norm(state[k])));
  }

  /** Camera frame: d points from the origin to the camera. */
  function basis() {
    const { theta, phi } = cam;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const ct = Math.cos(theta), st = Math.sin(theta);
    return {
      d: [cp * ct, cp * st, sp],
      right: [-st, ct, 0],
      up: [-sp * ct, -sp * st, cp],
    };
  }

  /**
   * Project b onto span(a1, a2) via the normal equations.
   *
   * Returns:
   *   null if a1, a2 are (near) parallel, else {n, g11, g12, g22, r1, r2,
   *   c1, c2, p, e}: n unit normal, [[g11, g12], [g12, g22]] = A^T A,
   *   (r1, r2) = A^T b, (c1, c2) = (A^T A)^-1 A^T b, p = A c, e = b - p
   */
  function solve() {
    const { a1, a2, b } = state;
    const n = V.cross(a1, a2);
    const nn = V.norm(n);
    const scaleA = V.norm(a1) * V.norm(a2);
    if (scaleA < 1e-9 || nn < 1e-3 * scaleA) return null;
    const g11 = V.dot(a1, a1), g12 = V.dot(a1, a2), g22 = V.dot(a2, a2);
    const r1 = V.dot(a1, b), r2 = V.dot(a2, b);
    const det = g11 * g22 - g12 * g12;
    const c1 = (g22 * r1 - g12 * r2) / det;
    const c2 = (g11 * r2 - g12 * r1) / det;
    const p = V.add(V.scale(a1, c1), V.scale(a2, c2));
    return { n: V.scale(n, 1 / nn), g11, g12, g22, r1, r2, c1, c2, p,
      e: V.sub(b, p) };
  }

  function render() {
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();

    const B = basis();
    scale = Math.min(W, H) / (2 * extent * 1.2) * cam.zoom;
    const D = extent * 7;
    const cx = W / 2, cy = H / 2;
    const P = (v) => {
      const f = D / (D - V.dot(v, B.d));
      return [cx + scale * f * V.dot(v, B.right),
        cy - scale * f * V.dot(v, B.up), f];
    };

    const layer = {};
    for (const k of ["back", "plane", "mid", "front", "labels"]) {
      layer[k] = svgEl("g", {}, svg);
    }
    const sol = solve();
    const viewerSide = sol ? Math.sign(V.dot(sol.n, B.d)) : 1;
    const layerOf = (q) => {
      if (!sol) return layer.front;
      const sd = V.dot(sol.n, q);
      if (Math.abs(sd) < 1e-9) return layer.mid;
      return Math.sign(sd) === viewerSide ? layer.front : layer.back;
    };

    const O = P([0, 0, 0]);
    const AX = extent * 1.05;
    ["x", "y", "z"].forEach((name, i) => {
      for (const sgn of [1, -1]) {
        const q = [0, 0, 0];
        q[i] = sgn * AX;
        const g = layerOf(q);
        const Q = P(q);
        if (sgn > 0) {
          drawArrow(g, O, Q, "#98a1b1", { width: 1.4, head: 9 });
          q[i] = AX * 1.07;
          const L = P(q);
          const t = svgEl("text", {
            x: L[0], y: L[1] + 5, class: "axis-label", "text-anchor": "middle",
          }, g);
          t.textContent = name;
        } else {
          svgEl("line", {
            x1: O[0], y1: O[1], x2: Q[0], y2: Q[1], class: "axis3 neg",
          }, g);
        }
      }
    });

    let u1 = null, u2 = null;
    if (sol) {
      u1 = V.unit(state.a1);
      u2 = V.unit(V.sub(state.a2, V.scale(u1, V.dot(state.a2, u1))));
      const S = extent * 0.9;
      const at = (i, j) => P(V.add(V.scale(u1, i), V.scale(u2, j)));
      const corners = [at(-S, -S), at(S, -S), at(S, S), at(-S, S)];
      svgEl("polygon", {
        points: corners.map((q) => q[0] + "," + q[1]).join(" "),
        class: "plane",
      }, layer.plane);
      const step = S > 6 ? 2 : 1;
      const K = Math.floor(S / step);
      for (let i = -K; i <= K; i++) {
        const k = i * step;
        for (const [q0, q1] of [[at(k, -S), at(k, S)], [at(-S, k), at(S, k)]]) {
          svgEl("line", {
            x1: q0[0], y1: q0[1], x2: q1[0], y2: q1[1], class: "plane-grid",
          }, layer.plane);
        }
      }
      // Tag the corner nearest the top of the view, nudged inward.
      const top = corners.reduce((m, q) => (q[1] < m[1] ? q : m));
      const mid = P([0, 0, 0]);
      const t = svgEl("text", {
        x: top[0] + (mid[0] - top[0]) * 0.1,
        y: top[1] + (mid[1] - top[1]) * 0.1 + 4,
        class: "span-label", "text-anchor": "middle",
      }, layer.plane);
      t.textContent = "span(a₁, a₂)";
    }

    const col = {};
    for (const k of ["a1", "a2", "b", "p", "e"]) col[k] = color(k);
    const withVals = optVals.checked;
    const lab = (name, v) => (withVals ? `${name} = ${fmtVec(v, 1)}` : name);
    const labels = [];
    const bLayer = sol ? layerOf(state.b) : layer.front;
    const aLayer = sol ? layer.mid : layer.front;

    tips = {};
    for (const k of KEYS) tips[k] = P(state[k]);
    for (const k of ["a1", "a2"]) {
      drawHalo(aLayer, tips[k], col[k], hover === k || drag?.key === k);
    }

    if (sol) {
      const Ps = P(sol.p);
      if (optCoef.checked) {
        const q1 = V.scale(state.a1, sol.c1), q2 = V.scale(state.a2, sol.c2);
        const Q1 = P(q1), Q2 = P(q2);
        for (const Q of [Q1, Q2]) {
          svgEl("line", {
            x1: Q[0], y1: Q[1], x2: Ps[0], y2: Ps[1], class: "guide",
          }, layer.mid);
        }
        drawArrow(layer.mid, O, Q1, col.a1, { width: 2, head: 10,
          dash: "5 4", opacity: 0.85 });
        drawArrow(layer.mid, O, Q2, col.a2, { width: 2, head: 10,
          dash: "5 4", opacity: 0.85 });
        labels.push({ text: "c₁a₁", color: col.a1, p0: O, p1: Q1,
          outline: true, small: true });
        labels.push({ text: "c₂a₂", color: col.a2, p0: O, p1: Q2,
          outline: true, small: true });
      }
      drawArrow(layer.mid, O, Ps, col.p, { width: 7, head: 18 });
      labels.push({ text: lab("p", sol.p), color: col.p, p0: O, p1: Ps });

      const en = V.norm(sol.e), pn = V.norm(sol.p);
      if (en > 1e-6) {
        let k = Math.min(extent * 0.07, en * 0.45);
        if (pn > 1e-6) k = Math.min(k, pn * 0.45);
        const u = pn > 1e-6 ? V.scale(sol.p, -1 / pn) : u1;
        const w = V.scale(sol.e, 1 / en);
        const pts = [
          V.add(sol.p, V.scale(u, k)),
          V.add(sol.p, V.add(V.scale(u, k), V.scale(w, k))),
          V.add(sol.p, V.scale(w, k)),
        ].map(P);
        svgEl("polyline", {
          points: pts.map((q) => q[0] + "," + q[1]).join(" "),
          class: "right-angle",
        }, bLayer);
      }
      drawArrow(bLayer, Ps, tips.b, col.e, { width: 3.2 });
      labels.push({ text: lab("e", sol.e), color: col.e, p0: Ps, p1: tips.b });
    }
    for (const k of ["a1", "a2"]) {
      drawArrow(aLayer, O, tips[k], col[k], { width: 3.2 });
    }
    drawHalo(bLayer, tips.b, col.b, hover === "b" || drag?.key === "b");
    drawArrow(bLayer, O, tips.b, col.b, { width: 3.2 });
    svgEl("circle", { cx: O[0], cy: O[1], r: 3.5, class: "origin" },
      layer.mid);

    // Placement priority: b, e, p, then the basis, then the guides.
    const coefLabels = labels.filter((l) => l.small);
    const ordered = [
      { text: lab("b", state.b), color: col.b, p0: O, p1: tips.b },
      ...labels.filter((l) => !l.small).reverse(),
      { text: lab(NAMES.a1, state.a1), color: col.a1, p0: O, p1: tips.a1 },
      { text: lab(NAMES.a2, state.a2), color: col.a2, p0: O, p1: tips.a2 },
      ...coefLabels,
    ];
    drawLabels(layer.labels, ordered, { W, H });
    updateReadout(sol);
  }

  function updateReadout(sol) {
    const a1 = chip("a1", NAMES.a1), a2 = chip("a2", NAMES.a2),
      b = chip("b", "b"), p = chip("p", "p"), e = chip("e", "e");
    if (!sol) {
      readout.innerHTML = `<h3>Live numbers</h3><p class="warn">${a1} and
        ${a2} are parallel (or zero), so they span a line, not a plane.
        A<sup>T</sup>A is not invertible. Change one of them.</p>`;
      return;
    }
    const row = (k, v) => `<div class="row"><span>${k}</span>
      <span class="val">${v}</span></div>`;
    const mat = (cells, cols) => `<span class="mat" style="
      grid-template-columns: repeat(${cols}, auto)">${cells
      .map((x) => `<span>${fmt(x)}</span>`).join("")}</span>`;
    const ok = `<span class="ok">&perp; &check;</span>`;
    readout.innerHTML = "<h3>Live numbers</h3>" +
      row("A<sup>T</sup>A", mat([sol.g11, sol.g12, sol.g12, sol.g22], 2)) +
      row(`A<sup>T</sup>${b}`, mat([sol.r1, sol.r2], 1)) +
      row(`<i>c</i> = (A<sup>T</sup>A)<sup>&minus;1</sup>A<sup>T</sup>${b}`,
        fmtVec([sol.c1, sol.c2], 3)) +
      row(`${p} = <i>c</i><sub>1</sub>${a1} + <i>c</i><sub>2</sub>${a2}`,
        fmtVec(sol.p)) +
      row(`${e} = ${b} &minus; ${p}`, fmtVec(sol.e)) +
      row(`${a1} &middot; ${e}`, `${fmt(V.dot(state.a1, sol.e))} ${ok}`) +
      row(`${a2} &middot; ${e}`, `${fmt(V.dot(state.a2, sol.e))} ${ok}`) +
      row(`&Vert;${e}&Vert; <span class="muted">(distance to plane)</span>`,
        fmt(V.norm(sol.e)));
  }

  function buildInputs() {
    let html = `<span></span><span class="hd">x</span><span class="hd">y</span>
      <span class="hd">z</span>`;
    for (const k of KEYS) {
      html += chip(k, NAMES[k]);
      for (let i = 0; i < 3; i++) {
        html += `<input type="number" step="0.5" data-k="${k}" data-i="${i}"
          aria-label="${NAMES[k]} ${"xyz"[i]}">`;
      }
    }
    inputsEl.innerHTML = html;
    inputsEl.addEventListener("input", (ev) => {
      const el = ev.target;
      const x = parseFloat(el.value);
      if (!Number.isFinite(x)) return;
      state[el.dataset.k][+el.dataset.i] = x;
      fitExtent();
      requestRender();
    });
  }

  function syncInputs() {
    for (const el of inputsEl.querySelectorAll("input")) {
      if (el === document.activeElement && !drag) continue;
      el.value = +state[el.dataset.k][+el.dataset.i].toFixed(2);
    }
  }

  function randomize() {
    const r = (m) => Math.floor(Math.random() * (2 * m + 1)) - m;
    for (let tries = 0; tries < 500; tries++) {
      setVectors({ a1: [r(3), r(3), r(3)], a2: [r(3), r(3), r(3)],
        b: [r(4), r(4), r(4)] });
      const sol = solve();
      if (!sol) continue;
      const sin = V.norm(V.cross(state.a1, state.a2)) /
        (V.norm(state.a1) * V.norm(state.a2));
      if (sin > 0.5 && V.norm(sol.e) > 1 && V.norm(sol.p) > 1) break;
    }
    fitExtent();
    syncInputs();
    viewOblique();
  }

  // Camera animation between preset views.
  function lookFrom(d) {
    const theta = Math.atan2(d[1], d[0]);
    const phi = Math.asin(Math.max(-1, Math.min(1, d[2])));
    const TAU = 2 * Math.PI;
    const dth = (((theta - cam.theta + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    tween = { t0: performance.now(), th0: cam.theta, ph0: cam.phi, dth,
      dph: phi - cam.phi, z0: cam.zoom, dz: 1 - cam.zoom };
    requestRender();
  }

  const towardViewer = (d) => (V.dot(d, basis().d) < 0 ? V.scale(d, -1) : d);

  function viewFaceOn() {
    const sol = solve();
    if (sol) lookFrom(towardViewer(sol.n));
  }

  /** Tilt the camera the least amount that puts the plane edge-on. */
  function viewEdgeOn() {
    const sol = solve();
    if (!sol) return;
    const d0 = basis().d;
    let d = V.sub(d0, V.scale(sol.n, V.dot(d0, sol.n)));
    if (V.norm(d) < 0.05) {
      const pn = V.norm(sol.p);
      const inPlane = pn > 1e-6 ? V.scale(sol.p, 1 / pn) : V.unit(state.a1);
      d = V.cross(sol.n, inPlane);
    }
    lookFrom(V.unit(d));
  }

  /** Look from 45 deg off the normal, sideways to p, so p and e both show. */
  function viewOblique() {
    const sol = solve();
    if (!sol) return;
    const n = sol.n[2] < 0 ? V.scale(sol.n, -1) : sol.n;
    const pn = V.norm(sol.p);
    const inPlane = pn > 1e-6 ? V.scale(sol.p, 1 / pn) : V.unit(state.a1);
    let w = V.unit(V.cross(n, inPlane));
    if (w[2] < 0) w = V.scale(w, -1);
    lookFrom(V.unit(V.add(n, w)));
  }

  let pending = false;
  function requestRender() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    pending = false;
    let again = false;
    if (tween) {
      const u = Math.min(1, (now - tween.t0) / 700);
      const s = u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
      cam.theta = tween.th0 + tween.dth * s;
      cam.phi = tween.ph0 + tween.dph * s;
      cam.zoom = tween.z0 + tween.dz * s;
      if (u >= 1) tween = null;
      again = true;
    } else if (optSpin.checked && !drag && svg.clientWidth) {
      cam.theta += 0.004;
      again = true;
    }
    render();
    if (again) requestRender();
  }

  function hitTip(px, py) {
    let best = null, bestD = 20;
    for (const k of ["b", "a1", "a2"]) {
      if (!tips[k]) continue;
      const d = Math.hypot(tips[k][0] - px, tips[k][1] - py);
      if (d < bestD) { best = k; bestD = d; }
    }
    return best;
  }

  svg.addEventListener("pointerdown", (ev) => {
    const [px, py] = localPoint(svg, ev);
    tween = null;
    const k = hitTip(px, py);
    drag = k
      ? { key: k, x0: px, y0: py, v0: [...state[k]], f: tips[k][2],
        B: basis() }
      : { key: null, x0: px, y0: py, theta0: cam.theta, phi0: cam.phi };
    svg.setPointerCapture(ev.pointerId);
    svg.style.cursor = "grabbing";
    ev.preventDefault();
  });

  svg.addEventListener("pointermove", (ev) => {
    const [px, py] = localPoint(svg, ev);
    if (!drag) {
      const k = hitTip(px, py);
      svg.style.cursor = k ? "move" : "grab";
      if (k !== hover) { hover = k; requestRender(); }
      return;
    }
    const dx = px - drag.x0, dy = py - drag.y0;
    if (drag.key) {
      const sc = scale * drag.f;
      const v = V.add(drag.v0, V.add(V.scale(drag.B.right, dx / sc),
        V.scale(drag.B.up, -dy / sc)));
      state[drag.key] = v.map((x) => Math.round(x * 10) / 10);
      syncInputs();
    } else {
      cam.theta = drag.theta0 - dx * 0.008;
      cam.phi = Math.max(-1.55, Math.min(1.55, drag.phi0 + dy * 0.008));
    }
    requestRender();
  });

  const endDrag = () => {
    if (drag?.key) fitExtent();
    drag = null;
    svg.style.cursor = hover ? "move" : "grab";
    requestRender();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  svg.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    tween = null;
    cam.zoom = Math.max(0.4, Math.min(3, cam.zoom * Math.exp(-ev.deltaY *
      0.0015)));
    requestRender();
  }, { passive: false });

  const on = (id, fn) => document.getElementById(id)
    .addEventListener("click", fn);
  on("reset3d", () => {
    setVectors(DEFAULTS);
    fitExtent();
    syncInputs();
    const { theta, phi } = DEFAULT_CAM;
    lookFrom([Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta),
      Math.sin(phi)]);
  });
  on("random3d", randomize);
  on("face3d", viewFaceOn);
  on("edge3d", viewEdgeOn);
  on("combo3d", () => {
    state.a2 = V.add(state.a1, state.a2);
    fitExtent();
    syncInputs();
    requestRender();
  });
  [optCoef, optVals].forEach((o) => o.addEventListener("change",
    requestRender));
  optSpin.addEventListener("change", requestRender);

  setVectors(DEFAULTS);
  fitExtent();
  buildInputs();
  syncInputs();
  svg.style.cursor = "grab";
  new ResizeObserver(requestRender).observe(svg);
})();
