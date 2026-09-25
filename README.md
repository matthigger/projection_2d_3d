# projection_2d_3d

Interactive teaching demos of vector projection, the geometry behind least
squares. Two tabs:

- **2D, onto a line.** Drag the tips of `a` and `b`. Shows
  `p = (a·b / a·a) a`, the error `e = b − p`, and the right angle between them.
- **3D, onto a plane.** `a₁` and `a₂` span a plane and `b` is projected onto
  it via the normal equations `AᵀA c = Aᵀb`. Drag to rotate, drag a tip to
  move a vector, scroll to zoom. Edge-on / face-on buttons animate the camera.

Each vector keeps a fixed colour (a blue, a₂ violet, b green, p orange,
e red), and its name and value are drawn on the arrow itself. A side panel
explains the idea and shows live numbers.

Plain HTML/CSS/JS with SVG: no build step and no dependencies, so it also
works offline.

## Run locally

Open `index.html` in a browser, or serve it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Link straight to a tab with `index.html#2d` or `index.html#3d`.

## Publish on GitHub Pages

```sh
gh repo create matthigger/projection_2d_3d --public --source . --push
gh api -X POST repos/matthigger/projection_2d_3d/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

The site then lives at <https://matthigger.github.io/projection_2d_3d/>.

## Layout

| file | role |
|------|------|
| `index.html` | page, explanation text, tab switching |
| `style.css` | layout and the vector colour palette (`--c-*`) |
| `js/common.js` | vector math, arrows, overlap-avoiding on-arrow labels |
| `js/proj2d.js` | 2D demo |
| `js/proj3d.js` | 3D demo (orbit camera, layered drawing around the plane) |
