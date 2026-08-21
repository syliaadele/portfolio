// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

const root = document.documentElement;

// ===== Column grid with crosshairs =====
// Positions come from the CSS custom properties, not from a copy kept
// here: style.css aligns the text to the same --c1..--c4 / --r1--r2, so
// reading them back is what stops the rules and the type from drifting.
const gridPos = (names) => {
  const cs = getComputedStyle(root);
  return names.map((n) => cs.getPropertyValue(n).trim()).filter(Boolean);
};

const grid = document.getElementById("grid");
const GRID_COLS = gridPos(["--c1", "--c2", "--c3", "--c4"]);
const GRID_ROWS = gridPos(["--r1", "--r2"]);
GRID_COLS.forEach((left) => {
  const line = document.createElement("div");
  line.className = "gline";
  line.style.left = left;
  GRID_ROWS.forEach((top) => {
    const plus = document.createElement("span");
    plus.className = "plus";
    plus.style.top = top;
    plus.textContent = "+";
    line.appendChild(plus);
  });
  grid.appendChild(line);
});
GRID_ROWS.forEach((top) => {
  const line = document.createElement("div");
  line.className = "hline";
  line.style.top = top;
  grid.appendChild(line);
});

// ===== Theme (L / D) =====
const themeBtn = document.getElementById("theme");
const themeVal = document.getElementById("themeVal");

function setTheme(theme) {
  root.dataset.theme = theme;
  if (themeVal) themeVal.textContent = theme === "dark" ? "D" : "L";
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}

let savedTheme = null;
try {
  savedTheme = localStorage.getItem("theme");
} catch (e) {}
setTheme(savedTheme || "light");
themeBtn.addEventListener("click", () =>
  setTheme(root.dataset.theme === "dark" ? "light" : "dark")
);

// ===== Language (EN / FR) =====
const i18nEls = document.querySelectorAll("[data-fr]");
const originalEN = new Map();
i18nEls.forEach((el) => originalEN.set(el, el.innerHTML));
const langBtn = document.getElementById("lang");
const langVal = document.getElementById("langVal");

function setLang(lang) {
  i18nEls.forEach((el) => {
    el.innerHTML = lang === "fr" ? el.getAttribute("data-fr") : originalEN.get(el);
  });
  root.lang = lang;
  langVal.textContent = lang.toUpperCase();
  try {
    localStorage.setItem("lang", lang);
  } catch (e) {}
}

let savedLang = "en";
try {
  savedLang = localStorage.getItem("lang") || "en";
} catch (e) {}
setLang(savedLang);
langBtn.addEventListener("click", () => setLang(root.lang === "fr" ? "en" : "fr"));

// ===== Status bar — Paris clock + cursor coordinates =====
const clock = document.getElementById("clock");
const coords = document.getElementById("coords");

function tick() {
  const t = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
  clock.textContent = "GMT+2 FR " + t;
}
tick();
setInterval(tick, 10000);

const pad = (n) => String(Math.round(n)).padStart(4, "0");

// ===== "hello" glass sculpture =====
// Authored at 1400x600; --k scales it to the viewport so the SVG filter
// and the clip-path keep sharing one coordinate space.
const hello = document.getElementById("hello");
const helloTilt = document.getElementById("helloTilt");

const helloWord = document.getElementById("helloWord");

const HELLO = {
  design: { w: 960 },
  fill: 0.5, // share of viewport width the WORD itself spans
  maxScale: 1.25,
  shift: 30, // px of cursor parallax
  tiltX: 5.5, // deg of perspective shift
  tiltY: 8,
  ease: 0.05, // lower = heavier inertia
};

// Scale from the word's measured width rather than the artboard, so the
// 50% target holds whatever the script font's metrics turn out to be.
function sizeHello() {
  let wordW = HELLO.design.w;
  try {
    const box = helloWord.getBBox();
    if (box && box.width > 10) wordW = box.width + 20; // + stroke
  } catch (e) {
    /* getBBox throws if the SVG isn't rendered yet — keep the fallback */
  }
  /* On a phone, half the viewport leaves the word too small to register
     against the headline, so it takes up a much bigger share. */
  const fill = window.innerWidth < 700 ? 0.86 : HELLO.fill;
  const k = Math.min(HELLO.maxScale, (window.innerWidth * fill) / wordW);
  hello.style.setProperty("--k", k.toFixed(3));
}
sizeHello();
window.addEventListener("resize", sizeHello, { passive: true });

/* PHONE PERFORMANCE — one targeted cut, nothing else.
   The glass keeps its full 24-primitive filter everywhere, so it looks
   identical on a phone. What goes is the pair of SMIL <animate> tags
   that slide the gradient: they change the filter's input 60 times a
   second, which makes the browser re-run the whole chain every frame.
   Removing them leaves the rendered result byte-for-byte the same in a
   still image, and lets the browser rasterise it once. */
function calmHello() {
  if (window.innerWidth >= 900 && window.matchMedia("(pointer: fine)").matches) {
    return false;
  }
  document.querySelectorAll("#hGrad animate").forEach((a) => a.remove());
  return true;
}
const helloIsLite = calmHello();

// Hold the reveal until the script font is ready — the filter would
// otherwise light a fallback serif for a frame, and the measurement
// above would be taken from the wrong letterforms.
const showHello = () =>
  requestAnimationFrame(() => {
    sizeHello();
    hello.classList.add("in");
  });

if (document.fonts && document.fonts.load) {
  document.fonts.load('300px "Pacifico"').then(showHello).catch(showHello);
} else {
  showHello();
}

// Cursor parallax + perspective shift, eased toward the pointer.
const calmMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!calmMotion.matches) {
  let tx = 0,
    ty = 0, // target, normalised -1..1
    cx = 0,
    cy = 0; // current, eased
  let helloRunning = false;

  const paint = () => {
    cx += (tx - cx) * HELLO.ease;
    cy += (ty - cy) * HELLO.ease;

    helloTilt.style.transform =
      `translate3d(${(cx * HELLO.shift).toFixed(2)}px, ${(cy * HELLO.shift * 0.55).toFixed(2)}px, 0)` +
      ` rotateY(${(cx * HELLO.tiltY).toFixed(2)}deg)` +
      ` rotateX(${(-cy * HELLO.tiltX).toFixed(2)}deg)`;

    if (Math.abs(tx - cx) < 0.001 && Math.abs(ty - cy) < 0.001) {
      helloRunning = false;
      return;
    }
    requestAnimationFrame(paint);
  };

  const runHello = () => {
    if (helloRunning) return;
    helloRunning = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener(
    "mousemove",
    (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      runHello();
    },
    { passive: true }
  );

  // Drift back to centre when the pointer leaves
  const restHello = () => {
    tx = 0;
    ty = 0;
    runHello();
  };
  document.addEventListener("mouseleave", restHello);
  window.addEventListener("blur", restHello);
}

// ===== "hello" — liquid glass distortion under the cursor =====
// The SVG equivalent of a vertex shader: a displacement field is baked
// once into an image whose R/G channels encode an (x,y) offset, then
// feDisplacementMap samples it per-pixel. Moving the image moves the
// deformation; changing the filter's `scale` changes its strength.
(function liquidHello() {
  const svg = document.querySelector(".hello-svg");
  const warpGroup = document.getElementById("helloWarp");
  const rippleImg = document.getElementById("hRipple");
  const warpMap = document.getElementById("hWarpMap");
  const hueRot = document.getElementById("hHueRot");
  const hueDisc = document.getElementById("hHueDisc");
  if (!svg || !warpGroup || !rippleImg || !warpMap) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  /* another whole-filter recompute per frame — desktop pointers only */
  if (helloIsLite || !window.matchMedia("(pointer: fine)").matches) return;

  const VIEW = { w: 960, h: 420 }; // artboard units
  const R = {
    size: 440, // diameter of influence, in artboard units
    strength: 64, // peak displacement (scale/2 px at the crest)
    stiffness: 0.14, // spring constant — higher snaps harder
    damping: 0.76, // < 1 leaves a little overshoot, i.e. elasticity
    pad: 90, // how far outside the word the effect still reaches
    breathe: 0.1, // slow modulation so the gel never looks frozen
    hueCycle: 4500, // ms for a full trip round the colour wheel
    hueSize: 240, // diameter of the colour halo, independent of `size`:
    // below it the tint reads as a spot inside the deformation
  };

  /* --- bake the displacement field ---------------------------------
     Centre pulls in, a ring around it pushes out, and everything fades
     to neutral grey (128,128) at the rim so there's no hard boundary. */
  function bakeField(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const half = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const d = Math.hypot(dx, dy);
        let r = 128,
          g = 128;

        if (d < 1 && d > 0.0001) {
          const falloff = Math.pow(1 - d, 1.6); // soft, no edge
          const wave = Math.sin(d * Math.PI * 1.9); // compress → expand
          const a = falloff * wave;
          r = 128 + (dx / d) * a * 127;
          g = 128 + (dy / d) * a * 127;
        }

        const i = (y * size + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  /* The hue mask: white, with alpha falling off to nothing at the rim.
     feComposite operator="in" reads that alpha, so the falloff is what
     feathers the colour into the rest of the word. */
  function bakeDisc(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c.toDataURL("image/png");
  }

  rippleImg.setAttribute("href", bakeField(256));
  if (hueDisc) hueDisc.setAttribute("href", bakeDisc(256));

  /* --- spring state ------------------------------------------------ */
  let x = VIEW.w / 2,
    y = VIEW.h / 2, // current centre, artboard units
    vx = 0,
    vy = 0,
    tx = x,
    ty = y; // target
  let s = 0,
    vs = 0,
    ts = 0; // strength
  let active = false;
  let filterOn = false;
  let huePhase = 0, // degrees round the wheel, advanced per frame
    lastNow = 0;

  const spring = (cur, vel, target) => {
    vel += (target - cur) * R.stiffness;
    vel *= R.damping;
    return [cur + vel, vel];
  };

  function frame(now) {
    [x, vx] = spring(x, vx, tx);
    [y, vy] = spring(y, vy, ty);
    [s, vs] = spring(s, vs, ts);

    // slow breathing keeps it feeling like gel rather than a stamp
    const pulse = 1 + R.breathe * Math.sin(now / 900);

    rippleImg.setAttribute("x", (x - R.size / 2).toFixed(1));
    rippleImg.setAttribute("y", (y - R.size / 2).toFixed(1));
    rippleImg.setAttribute("width", R.size);
    rippleImg.setAttribute("height", R.size);
    warpMap.setAttribute("scale", (s * pulse).toFixed(2));

    /* Hue drift, confined to the cursor by the disc mask. The phase
       advances per frame rather than being read off the clock, so entering
       always starts from the original blue and walks forward instead of
       jumping to wherever the clock happened to be. Its amount rides on
       the distortion's own strength, so the colour blooms in with the warp
       and unwinds as it settles — no second piece of hover state to keep
       in sync. The disc tracks the same sprung centre as the ripple, so
       the colour and the deformation are always the same event. */
    const dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    huePhase = (huePhase + (dt / R.hueCycle) * 360) % 360;
    const amount = Math.min(1, Math.abs(s) / R.strength);

    if (hueRot && hueDisc) {
      hueDisc.setAttribute("x", (x - R.hueSize / 2).toFixed(1));
      hueDisc.setAttribute("y", (y - R.hueSize / 2).toFixed(1));
      hueDisc.setAttribute("width", R.hueSize);
      hueDisc.setAttribute("height", R.hueSize);
      hueRot.setAttribute("values", (huePhase * amount).toFixed(1));
    }

    const settled =
      Math.abs(ts - s) < 0.05 && Math.abs(vs) < 0.05 && Math.abs(s) < 0.05;

    if (settled) {
      active = false;
      // drop the filter entirely at rest — identical output, zero cost
      warpMap.setAttribute("scale", "0");
      warpGroup.removeAttribute("filter");
      if (hueRot) hueRot.setAttribute("values", "0");
      huePhase = 0;
      lastNow = 0;
      filterOn = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (!filterOn) {
      warpGroup.setAttribute("filter", "url(#hWarp)");
      filterOn = true;
    }
    if (!active) {
      active = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener(
    "mousemove",
    (e) => {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;

      // client px → artboard units
      const lx = ((e.clientX - box.left) / box.width) * VIEW.w;
      const ly = ((e.clientY - box.top) / box.height) * VIEW.h;

      const padX = (R.pad / box.width) * VIEW.w;
      const padY = (R.pad / box.height) * VIEW.h;
      const inside =
        lx > -padX && lx < VIEW.w + padX && ly > -padY && ly < VIEW.h + padY;

      tx = lx;
      ty = ly;
      ts = inside ? R.strength : 0;

      // Jumping in from far away shouldn't drag a wave across the word
      if (inside && !filterOn) {
        x = lx;
        y = ly;
        vx = vy = 0;
      }
      wake();
    },
    { passive: true }
  );

  const release = () => {
    ts = 0;
    wake();
  };
  document.addEventListener("mouseleave", release);
  window.addEventListener("blur", release);
})();

// ===== "hello" — sparkle trail under the cursor =====
// Deliberately self-contained: its own hover test, its own inline styles,
// and the Web Animations API instead of a keyframe. Two earlier attempts
// died silently in CSS — first to a class name sky.css already owned, then
// to the risk of a var() taking a whole declaration down with it. Nothing
// here can be overridden by a stylesheet, and it does not inherit the
// distortion loop's gating either, so it runs even where that bails out.
(function sparkTrail() {
  const svg = document.querySelector(".hello-svg");
  if (!svg) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // The hue currently applied under the cursor, so the trail matches it
  const hueRot = document.getElementById("hHueRot");

  const S = {
    /* Dust, not sparkles: the motes are tiny, so density is what carries
       the effect. The rate goes up as the size comes down — a handful of
       specks would just read as noise. */
    every: 18, // ms between motes, at most
    minMove: 3, // px the pointer must travel before the next one
    /* kept tight so they read as one path behind the cursor rather than a
       cloud around it */
    below: [4, 22], // px under the cursor where they appear
    spreadX: 12, // px of horizontal scatter
    size: [2.5, 6], // px
    life: [800, 1300], // ms — long enough to leave a visible tail
    fall: [18, 44], // px each one drifts further down while fading
    cap: 110, // hard ceiling on live nodes
    baseHue: 210, // the glass's own blue

    /* Lightness is split in two on purpose. A near-white core is what
       makes the trail read as far lighter than the tint, but on a pale sky
       that alone vanished. The glow carries the colour instead, at a
       lightness that actually contrasts — so these stay very light without
       disappearing into the background. */
    light: 93, // % lightness of the core
    glowLight: 70, // % lightness of the halo around it
    /* Raised with the size drop: at 3px the core alone is a dead pixel,
       and the halo is what makes each mote read as lit. */
    glow: 2.2, // halo radius, as a multiple of each one's size
  };

  const STAR =
    "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%," +
    " 50% 100%, 39% 61%, 0% 50%, 39% 39%)";

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:fixed;inset:0;z-index:6;pointer-events:none;overflow:hidden";
  document.body.appendChild(layer);

  const rand = (a, b) => a + Math.random() * (b - a);
  let last = 0,
    lx = 0,
    ly = 0;

  const VIEW = { w: 960, h: 420 }; // artboard units, matching the viewBox
  const INK_PAD = 8; // artboard units, to cover the stroke round the glyphs
  let ink = null;

  /* The artboard is 960x420, but "hello" only occupies the middle of it —
     which is why the SVG's own box reached well past the word on both
     sides. getBBox gives the letterforms' actual bounds; they are in
     artboard units and the artboard never changes, so this is measured
     once and only the mapping to client pixels is redone per move. */
  function inkRect() {
    if (!ink) {
      try {
        const b = helloWord.getBBox();
        if (b && b.width > 10) {
          ink = {
            x: b.x - INK_PAD,
            y: b.y - INK_PAD,
            w: b.width + INK_PAD * 2,
            h: b.height + INK_PAD * 2,
          };
        }
      } catch (e) {
        /* not rendered yet — retry on the next move */
      }
    }
    return ink;
  }

  function spark(cx, cy) {
    const size = rand(S.size[0], S.size[1]);
    const spin = hueRot ? parseFloat(hueRot.getAttribute("values")) || 0 : 0;

    const hue = (S.baseHue + spin).toFixed(0);

    const el = document.createElement("i");
    el.style.cssText =
      "position:absolute;display:block;" +
      "left:" + (cx + rand(-S.spreadX, S.spreadX)).toFixed(0) + "px;" +
      "top:" + (cy + rand(S.below[0], S.below[1])).toFixed(0) + "px;" +
      "width:" + size.toFixed(1) + "px;" +
      "height:" + size.toFixed(1) + "px;" +
      "margin:" + (-size / 2).toFixed(1) + "px;" +
      "background:hsl(" + hue + " 100% " + S.light + "%);" +
      /* drop-shadow, not box-shadow: clip-path would cut a box-shadow off
         with the rest of the box, while a filter applies after the clip */
      "filter:drop-shadow(0 0 " + (size * S.glow).toFixed(1) + "px hsl(" +
      hue + " 100% " + S.glowLight + "%));" +
      "-webkit-clip-path:" + STAR + ";clip-path:" + STAR;
    layer.appendChild(el);

    /* A trail, not a pop: each one snaps in, then holds most of its life
       near full opacity before fading out. It also keeps its size to the
       end — scaling to 0, as this did before, reads as vanishing rather
       than fading, and left no tail behind the cursor. */
    const fall = rand(S.fall[0], S.fall[1]);
    const rot = rand(-70, 70);

    const anim = el.animate(
      [
        { opacity: 0, transform: "translateY(0px) scale(.45) rotate(0deg)" },
        {
          opacity: 1,
          offset: 0.14,
          transform:
            "translateY(2px) scale(1) rotate(" + (rot / 4).toFixed(0) + "deg)",
        },
        {
          opacity: 0.85,
          offset: 0.58,
          transform:
            "translateY(" + (fall * 0.45).toFixed(0) + "px) scale(.97)" +
            " rotate(" + (rot / 2).toFixed(0) + "deg)",
        },
        {
          opacity: 0,
          transform:
            "translateY(" + fall.toFixed(0) + "px) scale(.85)" +
            " rotate(" + rot.toFixed(0) + "deg)",
        },
      ],
      {
        duration: rand(S.life[0], S.life[1]),
        /* even fade — the front-loaded ease made them jump, then sit */
        easing: "ease-out",
        fill: "forwards",
      }
    );
    /* onfinish can be skipped if the tab is hidden mid-flight, so the cap
       below is what actually guarantees no node ever leaks */
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }

  window.addEventListener(
    "mousemove",
    (e) => {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;

      // strictly over the letterforms, not the artboard around them.
      // getBoundingClientRect carries the --k scale, the idle drift and the
      // cursor tilt, so the zone tracks the word wherever it actually is.
      const r = inkRect();
      if (!r) return;

      const sx = box.width / VIEW.w;
      const sy = box.height / VIEW.h;
      const l = box.left + r.x * sx;
      const t = box.top + r.y * sy;
      if (
        e.clientX < l ||
        e.clientX > l + r.w * sx ||
        e.clientY < t ||
        e.clientY > t + r.h * sy
      ) {
        return;
      }

      const now = performance.now();
      if (now - last < S.every) return;
      if (Math.hypot(e.clientX - lx, e.clientY - ly) < S.minMove) return;
      last = now;
      lx = e.clientX;
      ly = e.clientY;

      while (layer.childElementCount >= S.cap) {
        layer.firstElementChild.remove();
      }
      spark(e.clientX, e.clientY);
    },
    { passive: true }
  );
})();

// ===== Work list — cursor-following project preview =====
// Each row carries its cover in data-cover/data-srcset. Images are
// created once on first hover and kept, so re-hovering is instant.
(function workPreview() {
  const preview = document.getElementById("preview");
  const rows = document.querySelectorAll("#workList .row-btn");
  if (!preview || !rows.length) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const loaded = new Map();
  let current = null;
  let x = 0,
    y = 0,
    frame = null;

  const draw = () => {
    preview.style.translate = `${x}px ${y}px`;
    frame = null;
  };

  function show(row) {
    let img = loaded.get(row);
    if (!img) {
      img = new Image();
      img.src = row.dataset.cover;
      if (row.dataset.srcset) img.srcset = row.dataset.srcset;
      img.sizes = "300px";
      img.alt = "";
      img.decoding = "async";
      preview.appendChild(img);
      loaded.set(row, img);
    }
    if (current && current !== img) current.classList.remove("on");
    // next frame, so a freshly created image transitions in
    requestAnimationFrame(() => img.classList.add("on"));
    current = img;
    preview.classList.add("on");
  }

  rows.forEach((row) => {
    row.addEventListener("mouseenter", () => show(row));
    row.addEventListener("mouseleave", () => preview.classList.remove("on"));
    // keyboard users get the preview too
    row.addEventListener("focus", () => show(row));
    row.addEventListener("blur", () => preview.classList.remove("on"));
  });

  window.addEventListener(
    "mousemove",
    (e) => {
      x = e.clientX + 110;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(draw);
    },
    { passive: true }
  );
})();

// ===== Custom arrow cursor + live coordinates =====
const cursor = document.getElementById("cursor");
const fine = window.matchMedia("(pointer: fine)").matches;

if (fine) {
  document.body.classList.add("custom-cursor");

  let x = 0,
    y = 0,
    frame = null;

  const draw = () => {
    cursor.style.translate = `${x}px ${y}px`;
    frame = null;
  };

  window.addEventListener("mousemove", (e) => {
    x = e.clientX;
    y = e.clientY;
    coords.textContent = `${pad(e.clientX)} X ${pad(e.clientY)} Y`;
    cursor.classList.add("on");
    if (!frame) frame = requestAnimationFrame(draw);
  });

  window.addEventListener("mousedown", () => cursor.classList.add("tap"));
  window.addEventListener("mouseup", () => cursor.classList.remove("tap"));
  document.addEventListener("mouseleave", () => cursor.classList.remove("on"));
}

// ===== Reveal on scroll =====
document.querySelectorAll(".block").forEach((el) => el.classList.add("rv"));

// The contact finale animates as one piece, so it gets its own observer
// with a higher threshold — it should fire when you've committed to it,
// not as the first pixel appears.
const finale = document.querySelector(".foot--big");
if (finale) {
  new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.25 }
  ).observe(finale);
}

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.06, rootMargin: "0px 0px -5% 0px" }
);
document.querySelectorAll(".rv").forEach((el) => io.observe(el));
