/* ---------------------------------------------------------------
   Interactive blue sky background

   Usage:  <link rel="stylesheet" href="sky.css">
           <div class="sky" id="sky" aria-hidden="true"></div>
           <script src="sky.js"></script>

   Everything you'd want to art-direct lives in CONFIG below.
   --------------------------------------------------------------- */

(function () {
  "use strict";

  const CONFIG = {
    /* How hard the whole sky reacts to the cursor (px at the edges). */
    parallax: 46,

    /* Cursor repulsion: clouds within `radius` px drift away from the
       pointer by up to `push` px, falling off smoothly with distance. */
    radius: 460,
    push: 34,

    /* Easing per frame. Lower = heavier, more inertia. */
    ease: 0.055,

    /* Layers are ordered back to front.
         depth   0–1, the layer's place in space
         react   how strongly this layer answers the cursor (parallax +
                 repulsion). Kept separate from `depth` on purpose: the
                 far clouds sit deep but still move readably.
         blur    px of softness — this is the atmospheric perspective
         opacity how much the haze eats into the cloud
         clouds  x/y in % of viewport, s = scale, shape = 0|1|2,
                 drift = seconds per float cycle, sway/rise = px of travel */
    layers: [
      {
        depth: 0.12,
        react: 0.6,
        blur: 16,
        opacity: 0.5,
        clouds: [
          { x: 10, y: 20, s: 1.5, shape: 0, drift: 88, sway: 26, rise: 10 },
          { x: 38, y: 9,  s: 1.1, shape: 1, drift: 104, sway: 20, rise: 8 },
          { x: 66, y: 16, s: 1.3, shape: 2, drift: 96, sway: 24, rise: 9 },
          { x: 92, y: 30, s: 1.4, shape: 1, drift: 82, sway: 22, rise: 11 }
        ]
      },
      {
        depth: 0.34,
        react: 0.8,
        blur: 8,
        opacity: 0.78,
        clouds: [
          { x: 20, y: 50, s: 2.0, shape: 2, drift: 68, sway: 34, rise: 14 },
          { x: 52, y: 33, s: 1.5, shape: 1, drift: 74, sway: 30, rise: 12 },
          { x: 80, y: 58, s: 2.2, shape: 0, drift: 62, sway: 36, rise: 15 }
        ]
      },
      {
        /* Foreground sits slightly out of focus — a shallow depth of
           field, so the near clouds read softer than the mid layer. */
        depth: 0.66,
        react: 1,
        blur: 10,
        opacity: 0.82,
        clouds: [
          { x: -2, y: 80, s: 3.0, shape: 0, drift: 52, sway: 46, rise: 18 },
          { x: 60, y: 92, s: 3.3, shape: 2, drift: 58, sway: 42, rise: 16 },
          { x: 97, y: 72, s: 2.5, shape: 1, drift: 48, sway: 44, rise: 20 }
        ]
      }
    ]
  };

  /* Cloud silhouettes — clusters of ellipses, softened by the CSS blur.
     Base box is 320 x 140; `s` scales from a 300px reference width. */
  const SHAPES = [
    [[86, 92, 78, 34], [150, 68, 62, 44], [206, 84, 58, 32], [120, 64, 46, 36], [246, 96, 50, 24], [58, 98, 44, 22]],
    [[100, 90, 70, 34], [140, 56, 54, 46], [186, 74, 54, 36], [76, 74, 44, 30], [212, 92, 48, 26]],
    [[70, 92, 66, 26], [140, 78, 82, 36], [216, 88, 70, 28], [118, 62, 50, 32], [182, 66, 46, 28], [258, 96, 42, 20]]
  ];

  const root = document.getElementById("sky");
  if (!root) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- build ---------- */

  const ns = "http://www.w3.org/2000/svg";
  const svgSprite = () => {
    const ellipses = (set) =>
      set
        .map((e) => `<ellipse cx="${e[0]}" cy="${e[1]}" rx="${e[2]}" ry="${e[3]}"/>`)
        .join("");

    return (
      `<svg class="sky-sprite" width="0" height="0" aria-hidden="true">` +
      `<defs><linearGradient id="sky-cloud-fill" x1="0" y1="0" x2="0" y2="1">` +
      /* var() only resolves in CSS declarations, not in SVG
         presentation attributes — hence style="" here */
      `<stop offset="0%" style="stop-color:var(--cloud-top)"/>` +
      `<stop offset="100%" style="stop-color:var(--cloud-base)"/>` +
      `</linearGradient>` +
      SHAPES.map(
        (set, i) =>
          `<symbol id="sky-cl-${i}" viewBox="0 0 320 140">` +
          `<g fill="url(#sky-cloud-fill)">${ellipses(set)}</g></symbol>`
      ).join("") +
      `</defs></svg>`
    );
  };

  root.insertAdjacentHTML(
    "beforeend",
    `<div class="sky-light"></div>` + svgSprite()
  );

  const layers = CONFIG.layers.map((def) => {
    const el = document.createElement("div");
    el.className = "sky-layer";

    const clouds = def.clouds.map((c) => {
      const wrap = document.createElement("div");
      wrap.className = "cloud";
      wrap.style.cssText =
        `left:${c.x}%;top:${c.y}%;` +
        `--w:${Math.round(300 * c.s)}px;` +
        `filter:blur(${def.blur}px);` +
        `opacity:${def.opacity};`;

      const inner = document.createElement("div");
      inner.className = "cloud-i";
      inner.style.cssText =
        `--sway:${c.sway}px;--rise:${c.rise}px;` +
        `--drift:${c.drift}s;` +
        /* negative delay desynchronises the float cycles */
        `animation-delay:-${(c.drift * ((c.x + c.y) % 100)) / 100}s;`;

      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 320 140");
      const use = document.createElementNS(ns, "use");
      use.setAttribute("href", `#sky-cl-${c.shape}`);
      svg.appendChild(use);

      inner.appendChild(svg);
      wrap.appendChild(inner);
      el.appendChild(wrap);

      /* x/y are viewport percentages; cached in px on resize */
      return { el: wrap, xPct: c.x, yPct: c.y, cx: 0, cy: 0, tx: 0, ty: 0 };
    });

    root.appendChild(el);
    return {
      el,
      depth: def.depth,
      react: def.react != null ? def.react : def.depth,
      clouds,
      x: 0,
      y: 0,
    };
  });

  root.insertAdjacentHTML("beforeend", `<div class="sky-haze"></div>`);

  /* ---------- interaction ---------- */

  let vw = 0,
    vh = 0;

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    layers.forEach((layer) =>
      layer.clouds.forEach((c) => {
        c.cx = (c.xPct / 100) * vw;
        c.cy = (c.yPct / 100) * vh;
      })
    );
  }
  measure();
  window.addEventListener("resize", measure, { passive: true });

  if (reduced.matches) return; /* static sky, nothing else to do */

  /* Pointer position, normalised to -1..1 from the centre. */
  let px = 0,
    py = 0, /* raw target      */
    ex = 0,
    ey = 0; /* eased, w/ inertia */
  let mouseX = -9999,
    mouseY = -9999;
  let running = false;

  function onMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    px = (mouseX / vw) * 2 - 1;
    py = (mouseY / vh) * 2 - 1;
    start();
  }

  /* Cursor gone: everything eases back to its natural float. */
  function onLeave() {
    px = 0;
    py = 0;
    mouseX = -9999;
    mouseY = -9999;
    start();
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeave);
  window.addEventListener("blur", onLeave);

  const near = (v) => Math.abs(v) < 0.01;

  function frame() {
    ex += (px - ex) * CONFIG.ease;
    ey += (py - ey) * CONFIG.ease;

    let settled = near(px - ex) && near(py - ey);

    for (const layer of layers) {
      const shift = CONFIG.parallax * layer.react;
      layer.el.style.transform =
        `translate3d(${(ex * shift).toFixed(2)}px, ${(ey * shift * 0.6).toFixed(2)}px, 0)`;

      for (const c of layer.clouds) {
        /* repulsion target — zero unless the pointer is close */
        let gx = 0,
          gy = 0;

        if (mouseX > -9998) {
          const dx = c.cx - mouseX;
          const dy = c.cy - mouseY;
          const dist = Math.hypot(dx, dy);
          if (dist < CONFIG.radius && dist > 0.001) {
            /* cosine falloff — no hard edge as clouds enter the radius */
            const f = (1 + Math.cos((dist / CONFIG.radius) * Math.PI)) / 2;
            const strength = CONFIG.push * f * layer.react;
            gx = (dx / dist) * strength;
            gy = (dy / dist) * strength;
          }
        }

        c.tx += (gx - c.tx) * CONFIG.ease;
        c.ty += (gy - c.ty) * CONFIG.ease;

        if (!near(gx - c.tx) || !near(gy - c.ty)) settled = false;

        c.el.style.transform =
          `translate3d(${c.tx.toFixed(2)}px, ${c.ty.toFixed(2)}px, 0)`;
      }
    }

    /* Park the loop once everything has come to rest. */
    if (settled && near(ex) && near(ey) && mouseX < -9998) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  start();
})();
