// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

const root = document.documentElement;

// ===== Column grid with crosshairs =====
const grid = document.getElementById("grid");
[3.5, 34, 65.5, 96.5].forEach((left) => {
  const line = document.createElement("div");
  line.className = "gline";
  line.style.left = left + "%";
  [33, 68].forEach((top) => {
    const plus = document.createElement("span");
    plus.className = "plus";
    plus.style.top = top + "%";
    plus.textContent = "+";
    line.appendChild(plus);
  });
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
  const k = Math.min(HELLO.maxScale, (window.innerWidth * HELLO.fill) / wordW);
  hello.style.setProperty("--k", k.toFixed(3));
}
sizeHello();
window.addEventListener("resize", sizeHello, { passive: true });

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
  if (!svg || !warpGroup || !rippleImg || !warpMap) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const VIEW = { w: 960, h: 420 }; // artboard units
  const R = {
    size: 380, // diameter of influence, in artboard units
    strength: 34, // peak displacement (scale/2 px at the crest)
    stiffness: 0.14, // spring constant — higher snaps harder
    damping: 0.76, // < 1 leaves a little overshoot, i.e. elasticity
    pad: 90, // how far outside the word the effect still reaches
    breathe: 0.1, // slow modulation so the gel never looks frozen
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

  rippleImg.setAttribute("href", bakeField(256));

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

    const settled =
      Math.abs(ts - s) < 0.05 && Math.abs(vs) < 0.05 && Math.abs(s) < 0.05;

    if (settled) {
      active = false;
      // drop the filter entirely at rest — identical output, zero cost
      warpMap.setAttribute("scale", "0");
      warpGroup.removeAttribute("filter");
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

// ===== Work list — accordion, one row open at a time =====
const rows = document.querySelectorAll(".row");
rows.forEach((row) => {
  const btn = row.querySelector(".row-btn");
  btn.addEventListener("click", () => {
    const willOpen = !row.classList.contains("open");
    rows.forEach((other) => {
      other.classList.remove("open");
      other.querySelector(".row-btn").setAttribute("aria-expanded", "false");
    });
    row.classList.toggle("open", willOpen);
    btn.setAttribute("aria-expanded", String(willOpen));
  });
});

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
document.querySelectorAll(".block, .foot > *").forEach((el) => el.classList.add("rv"));

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
