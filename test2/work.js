/* ---------------------------------------------------------------
   Shared behaviour for the work listing and project pages:
   theme, language, footer year, custom cursor, reveal on scroll.
   (The home page uses script.js, which does all this plus the hero.)
   --------------------------------------------------------------- */

const root = document.documentElement;

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Theme =====
const themeBtn = document.getElementById("theme");

/* The sky's gradient no longer carries a transition of its own — it was a
   full-viewport repaint left permanently armed for the sake of one flip
   (see the note in sky.css). These pages do not run the scroll journey,
   so the flip is the only thing that ever moves that gradient here, but
   the stylesheet is shared and so is the way back in: arm the transition
   for the length of the fade, then take it off. */
let themeShiftTimer = 0;
function setTheme(theme, animate) {
  if (animate) {
    root.classList.add("theme-shift");
    clearTimeout(themeShiftTimer);
    themeShiftTimer = setTimeout(
      () => root.classList.remove("theme-shift"),
      550
    );
  }
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}
let savedTheme = null;
try {
  savedTheme = localStorage.getItem("theme");
} catch (e) {}
setTheme(savedTheme || "light");
if (themeBtn) {
  themeBtn.addEventListener("click", () =>
    setTheme(root.dataset.theme === "dark" ? "light" : "dark", true)
  );
}

// ===== Language =====
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
  if (langVal) langVal.textContent = lang.toUpperCase();
  try {
    localStorage.setItem("lang", lang);
  } catch (e) {}
}
let savedLang = "en";
try {
  savedLang = localStorage.getItem("lang") || "en";
} catch (e) {}
setLang(savedLang);
if (langBtn) {
  langBtn.addEventListener("click", () => setLang(root.lang === "fr" ? "en" : "fr"));
}

// ===== Custom arrow cursor =====
const cursor = document.getElementById("cursor");
if (cursor && window.matchMedia("(pointer: fine)").matches) {
  document.body.classList.add("custom-cursor");
  let x = 0,
    y = 0,
    frame = null;
  const draw = () => {
    cursor.style.translate = `${x}px ${y}px`;
    frame = null;
  };
  window.addEventListener(
    "mousemove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      cursor.classList.add("on");
      if (!frame) frame = requestAnimationFrame(draw);
    },
    { passive: true }
  );
  window.addEventListener("mousedown", () => cursor.classList.add("tap"));
  window.addEventListener("mouseup", () => cursor.classList.remove("tap"));
  document.addEventListener("mouseleave", () => cursor.classList.remove("on"));
}

// ===== Reveal on scroll =====
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
