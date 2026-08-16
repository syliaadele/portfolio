/* ---------------------------------------------------------------
   Bakes the glass "hello" into a PNG on phones.

   The wordmark is a 24-primitive SVG filter. Rendering it once is
   fine; keeping it live means the browser may re-rasterise it while
   scrolling, which is what makes phones stutter. So on small screens
   we render it a single time into a canvas, swap in the resulting
   bitmap, and cache that in localStorage for later visits.

   Rasterising happens in the visitor's own browser, so the result is
   pixel-identical to what the live filter produced — no third-party
   renderer guessing at feSpecularLighting.

   Anything goes wrong at any step and the live SVG simply stays.
   --------------------------------------------------------------- */

(function rasterHello() {
  "use strict";

  const hello = document.getElementById("hello");
  const svg = hello && hello.querySelector(".hello-svg");
  if (!hello || !svg) return;

  const phone =
    window.innerWidth < 900 || !window.matchMedia("(pointer: fine)").matches;
  if (!phone) return;

  /* Bump the version when the artwork changes, or phones will keep
     serving the bitmap they baked from the old one. */
  const KEY = "helloPng:v1";
  const W = 960;
  const H = 420;
  const SCALE = Math.min(2, window.devicePixelRatio || 1);

  function swapIn(url) {
    const img = new Image();
    img.className = "hello-raster";
    img.alt = "";
    img.decoding = "async";
    img.onload = () => svg.replaceWith(img);
    img.src = url;
  }

  /* already baked on a previous visit */
  let cached = null;
  try {
    cached = localStorage.getItem(KEY);
  } catch (e) {}
  if (cached) {
    swapIn(cached);
    return;
  }

  /* The serialised SVG can't reach the page's stylesheet or webfont,
     so the font has to travel inside it as a data URI. */
  async function inlineFont() {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Pacifico&display=swap"
    ).then((r) => r.text());
    const url = (css.match(/url\((https:[^)]+)\)/) || [])[1];
    if (!url) throw new Error("font url not found");

    const buf = await fetch(url).then((r) => r.arrayBuffer());
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    const fmt = url.includes(".woff2") ? "woff2" : "woff";

    return (
      `@font-face{font-family:'Pacifico';font-style:normal;font-weight:400;` +
      `src:url(data:font/${fmt};base64,${b64}) format('${fmt}')}` +
      `.hello-type{font-family:'Pacifico',cursive;font-size:300px}`
    );
  }

  async function bake() {
    const fontCss = await inlineFont();

    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", W);
    clone.setAttribute("height", H);
    /* a moving gradient would only bake one arbitrary frame */
    clone.querySelectorAll("animate").forEach((a) => a.remove());

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = fontCss;
    clone.insertBefore(style, clone.firstChild);

    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    try {
      const bitmap = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      /* Safari has historically dropped SVG filters when rasterising
         through an <img>. If the canvas came back empty, keep the SVG. */
      const probe = ctx.getImageData(
        (canvas.width * 0.35) | 0,
        (canvas.height * 0.55) | 0,
        24,
        24
      ).data;
      let ink = 0;
      for (let i = 3; i < probe.length; i += 4) ink += probe[i];
      if (ink === 0) return;

      const png = canvas.toDataURL("image/png");
      swapIn(png);
      try {
        localStorage.setItem(KEY, png);
      } catch (e) {
        /* over quota — the bitmap still works for this page view */
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* Wait for the font, then bake off the critical path */
  const go = () =>
    "requestIdleCallback" in window
      ? requestIdleCallback(() => bake().catch(() => {}), { timeout: 2500 })
      : setTimeout(() => bake().catch(() => {}), 400);

  if (document.fonts && document.fonts.load) {
    document.fonts.load('300px "Pacifico"').then(go).catch(go);
  } else {
    go();
  }
})();
