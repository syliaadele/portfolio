// Dynamic year in the footer
document.getElementById("year").textContent = new Date().getFullYear();

// Full-width dropdown menu
const nav = document.getElementById("nav");
const burger = document.getElementById("burger");
const navMenu = document.getElementById("navMenu");
const navOverlay = document.getElementById("navOverlay");

function setMenu(open) {
  nav.classList.toggle("menu-open", open);
  document.body.classList.toggle("menu-open", open);
  burger.setAttribute("aria-expanded", String(open));
}
burger.addEventListener("click", () =>
  setMenu(!nav.classList.contains("menu-open"))
);
navMenu.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => setMenu(false))
);
navOverlay.addEventListener("click", () => setMenu(false));

// ===== Language switch (EN / FR) =====
const i18nEls = document.querySelectorAll("[data-fr]");
const originalEN = new Map();
i18nEls.forEach((el) => originalEN.set(el, el.innerHTML));
const langSwitch = document.getElementById("langSwitch");

function setLang(lang) {
  i18nEls.forEach((el) => {
    el.innerHTML = lang === "fr" ? el.getAttribute("data-fr") : originalEN.get(el);
  });
  document.documentElement.lang = lang;
  langSwitch.querySelectorAll(".lang-opt").forEach((opt) =>
    opt.classList.toggle("active", opt.dataset.lang === lang)
  );
  try {
    localStorage.setItem("lang", lang);
  } catch (e) {}
}

langSwitch.querySelectorAll(".lang-opt").forEach((opt) =>
  opt.addEventListener("click", () => setLang(opt.dataset.lang))
);

let savedLang = "en";
try {
  savedLang = localStorage.getItem("lang") || "en";
} catch (e) {}
setLang(savedLang);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

// Reveal-on-scroll for everything except the hero (hero is driven by the loader)
const revealEls = [...document.querySelectorAll(".reveal")].filter(
  (el) => !el.closest(".hero")
);
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
);
revealEls.forEach((el) => revealObserver.observe(el));

// ===== Page-load intro =====
const loader = document.getElementById("loader");

function revealHero() {
  document
    .querySelectorAll(".hero .reveal")
    .forEach((el) => el.classList.add("in"));
}

function startSite() {
  loader.classList.add("done"); // curtain slides up
  document.body.classList.remove("loading");
  setTimeout(revealHero, 450); // hero staggers in behind the curtain
  setTimeout(() => loader.remove(), 1100); // clean up after the slide
}

// Wait for the page to load, but show the intro for a minimum beat
let pageLoaded = false;
window.addEventListener("load", () => (pageLoaded = true));
setTimeout(function check() {
  pageLoaded ? startSite() : setTimeout(check, 100);
}, 1300);

// ===== Expandable work items (accordion — one open at a time) =====
const workItems = document.querySelectorAll(".work-item");
workItems.forEach((item) => {
  const head = item.querySelector(".work-head");
  const panel = item.querySelector(".work-panel");
  head.addEventListener("click", () => {
    const isOpen = item.classList.contains("open");
    workItems.forEach((other) => {
      if (other !== item) {
        other.classList.remove("open");
        other.querySelector(".work-head").setAttribute("aria-expanded", "false");
        other.querySelector(".work-panel").style.maxHeight = null;
      }
    });
    item.classList.toggle("open", !isOpen);
    head.setAttribute("aria-expanded", String(!isOpen));
    panel.style.maxHeight = isOpen ? null : panel.scrollHeight + "px";
  });
});

// Keep an open panel correctly sized on resize
window.addEventListener("resize", () => {
  const open = document.querySelector(".work-item.open .work-panel");
  if (open) open.style.maxHeight = open.scrollHeight + "px";
});
