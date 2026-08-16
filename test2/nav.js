/* ---------------------------------------------------------------
   Mobile burger menu.

   The nav markup is the same at every size — below the breakpoint CSS
   turns it into a panel and this script toggles it. Above it, the
   burger is hidden and none of this has any effect.
   --------------------------------------------------------------- */

(function burgerMenu() {
  "use strict";

  const bar = document.querySelector(".top");
  const burger = document.getElementById("burger");
  const menu = document.getElementById("topNav");
  if (!bar || !burger || !menu) return;

  function setOpen(open) {
    bar.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", String(open));
  }

  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!bar.classList.contains("menu-open"));
  });

  /* Close after picking a destination, but not when toggling theme,
     language or sound — those you may well want to chain. */
  menu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => setOpen(false))
  );

  document.addEventListener("click", (e) => {
    if (!bar.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  /* Leaving the breakpoint behind should never strand it open */
  const wide = window.matchMedia("(min-width: 641px)");
  const sync = () => wide.matches && setOpen(false);
  wide.addEventListener ? wide.addEventListener("change", sync) : wide.addListener(sync);
})();
