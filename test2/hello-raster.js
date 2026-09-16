/* ---------------------------------------------------------------
   Bakes the glass "hello" into a PNG.

   The wordmark is a 24-primitive SVG filter — feTurbulence, a
   displacement map, two specular lights and four blurs, none of which
   any browser puts on the GPU. Rendering it once is fine; keeping it
   live is not. It sits inside .hello-drift, which never stops moving,
   and its own gradient used to animate, so the filter's input changed
   on every frame and the whole chain re-ran on the CPU 60 times a
   second, for as long as the page was open. That is what pinned a
   core and made the machine itself stutter — not just the page.

   So we render it a single time into a canvas, swap in the resulting
   bitmap, and cache that in localStorage for later visits. From then
   on the browser is moving a picture around, which is free.

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

  /* The new site drives the filter itself — the cursor ripple writes into
     #helloWarp on every move — so there the SVG has to stay live and a
     bitmap would freeze the interaction. #helloWarp is the marker: the
     holding page has no such group and always bakes.

     MEASURED, and left in place deliberately. Baking here too took the
     page from 9fps to 31 — the live chain is far and away the most
     expensive thing on it. But swapping the bitmap out for the live SVG
     on approach, so the ripple survived, showed the wordmark visibly
     change shape: the bake does NOT reproduce the live filter, its
     letterforms come out markedly thinner. That was true before this was
     ever tried; it simply never showed, because desktop never baked and
     phones had nothing to compare against. Until the bake is faithful,
     the word's appearance is not the thing to trade away for frames.
     The real fix is to stop asking SVG filters to do this at all. */
  const driven =
    !!document.getElementById("helloWarp") &&
    window.innerWidth >= 900 &&
    window.matchMedia("(pointer: fine)").matches;
  if (driven) return;

  /* Bump the version when the artwork changes, or browsers will keep
     serving the bitmap they baked from the old one. */
  const NS = "http://www.w3.org/2000/svg";
  const KEY = "helloPng:v2"; /* v2: thicker strokes */
  const W = 960;
  const H = 420;
  const SCALE = Math.min(2, window.devicePixelRatio || 1);

  /* .hello-refract and .hello-sheen both clip themselves to
     #helloClipCore, which lives in the <defs> of the SVG we are about to
     throw away — and a clip-path pointing at nothing is not ignored, it
     resolves to no clip at all, so both would spill across the whole box.
     So the clipPath is MOVED (not copied) into a zero-sized keeper before
     the swap: same node, same id, still styled by the page's stylesheet,
     and nothing is left rendering the filter.

     Only the clipPath is kept. #hGrad, #hGlow and #hGlass go with the
     SVG — their whole point was to stop existing. */
  function keepClipPath() {
    const clip = svg.querySelector("#helloClipCore");
    if (!clip) return;

    const keeper = document.createElementNS(NS, "svg");
    keeper.setAttribute("width", "0");
    keeper.setAttribute("height", "0");
    keeper.setAttribute("aria-hidden", "true");
    keeper.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden";

    const defs = document.createElementNS(NS, "defs");
    defs.appendChild(clip);
    keeper.appendChild(defs);
    hello.appendChild(keeper);
  }

  function swapIn(url) {
    const img = new Image();
    img.className = "hello-raster";
    img.alt = "";
    img.decoding = "async";
    img.onload = () => {
      keepClipPath();
      svg.replaceWith(img);
    };
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

    /* Anything the page's stylesheet contributes has to be restated
       here — a serialised SVG carries none of it. stroke-width in
       particular is set by a media query on phones, so it is read back
       from the live element instead of being hard-coded. */
    const word = svg.querySelector("#helloWord");
    const stroke = word ? getComputedStyle(word).strokeWidth : "10px";

    return (
      `@font-face{font-family:'Pacifico';font-style:normal;font-weight:400;` +
      `src:url(data:font/${fmt};base64,${b64}) format('${fmt}')}` +
      `.hello-type{font-family:'Pacifico',cursive;font-size:300px}` +
      `#helloWord{stroke-width:${stroke}}`
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
