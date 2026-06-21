// Année dynamique dans le footer
document.getElementById("year").textContent = new Date().getFullYear();

// Menu burger (mobile)
const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");
burger.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => navLinks.classList.remove("open"))
);

// Animation d'apparition du hero au chargement
window.addEventListener("load", () => {
  document.querySelector(".hero").classList.add("loaded");
});

// Apparition des sections au scroll
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".section").forEach((s) => observer.observe(s));
