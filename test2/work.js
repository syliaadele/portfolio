/* ---------------------------------------------------------------
   Shared behaviour for the work listing and project pages:
   theme, language, footer year, custom cursor, reveal on scroll.
   (The home page uses script.js, which does all this plus the hero.)
   --------------------------------------------------------------- */

const root = document.documentElement;

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Column grid with crosshairs =====
const grid = document.getElementById("grid");
if (grid) {
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
}

// ===== Theme =====
const themeBtn = document.getElementById("theme");
function setTheme(theme) {
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
    setTheme(root.dataset.theme === "dark" ? "light" : "dark")
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
