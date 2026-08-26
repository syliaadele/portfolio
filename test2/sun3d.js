/* ---------------------------------------------------------------
   The sun, as actual geometry.

   Why this exists: CSS gradients and SVG filters both paint on a flat
   plane. There is no surface normal and no view angle there, so every
   earlier attempt was a picture OF a sphere — the grain stayed pasted
   flat across a flat disc. Here the sphere is real, and the colour is
   sampled from a 3D noise field at each point ON that surface, so it
   wraps the body and foreshortens toward the limb by itself.

   The look follows a reference: a soft marbled orb, its outline gently
   rippled, its edge dissolving into a large bloom. So the noise is
   deliberately LOW frequency — broad plates of colour rather than fine
   granulation — the vertices are displaced to break the perfect circle,
   and the body fades out before the silhouette instead of ending on it.

   Loaded on demand: script.js imports this only once the finale scrolls
   into view, so a visitor who never reaches the bottom never downloads
   Three at all. The CSS sun stays as the fallback and is only hidden once
   this reports success.
   --------------------------------------------------------------- */

import * as THREE from "./vendor/three.module.js";

/* Geometry in CSS pixels, mirroring the CSS sun it replaces so the
   composition does not shift when this takes over. */
const GEO = {
  cap: 340, // px of the disc clearing the bottom of the page

  /* The arc's CHORD, as a multiple of the viewport width — the radius is
     derived from it rather than set directly.

     Setting the radius from the width looked equivalent and was not. With
     a fixed 340px cap, the chord came to 1426px on a 1080px laptop, so the
     arc's ends fell 170px off each side and only its flat middle showed:
     a horizon. On a 2040px screen the same rule gave a 2060px chord — the
     ends landed exactly at the edges, so the whole dome was visible and it
     read as a hill. Same code, same cap, opposite shape.

     Holding the chord at a ratio instead keeps the ends off screen by the
     same margin everywhere. 1.32 is the laptop's own value, so that screen
     is unchanged. */
  spanRatio: 1.32,
};

const LOOK = {
  /* Broad plates, not granules: low frequency is the whole difference
     between the reference's marbling and a sandpaper texture. */
  /* IN PIXELS, converted per layout — the same trap as the cursor's dent.
     Held in sphere radii, a plate grew with the screen: ~680px across on a
     laptop but over 2000px on a wide monitor, which is wider than the whole
     visible band. The texture then stops being a texture and becomes one
     vast field of colour, which reads as a dune rising out of the sun.
     Fixed on screen, a plate is a plate everywhere. */
  marblePx: 680, // width of one plate of colour
  contrast: 0.22, // how hard the plates separate, 0..1
  flow: 0.02, // drift of the marbling; 0 freezes it

  /* Soft-box: one big diffuse source. Everything below is tuned away from
     definition — a wide fade instead of an edge, a shallow fall instead of
     a rim, and marbling barely above flat. */
  /* ~4px at this size. It cannot go to zero: the disc's outline is drawn
     by this alpha fade, not by the renderer's antialiasing, which only
     covers geometry edges and not a fade written in the shader. A couple
     of pixels is the crispest edge that still comes out smooth. */
  softEdge: 0.004, // fraction of the radius the body fades out over
  /* 1.0 now that the disc is a single light tone: any overdrive on a
     colour this pale just clips it to white and throws the cream away. */
  gain: 1.0,

  /* A gentle lift toward --sun-hot at the middle of the disc, fading to
     the plain colour at the limb. Only the outer part of the sphere clears
     the page, so this is a soft vertical gradient across the visible arc
     rather than a bullseye. */
  centre: 0.75,

  /* The highlight around the disc. NORMAL blending, not additive: an
     additive warm halo saturates — red clips long before blue — so it went
     orange and read as a shadow rather than a light. A near-white film
     laid over the sky lightens it without ever shifting its hue. */
  glowReach: 1.12, // in sun radii, from the centre
  glowAlpha: 0.5, // peak opacity at the limb
  glowWhite: 0.55, // how far the glow is pulled toward white

  /* --- the cursor, as on the "hello" -------------------------------
     Same gesture as the glass wordmark: the surface dents under the
     pointer, brightens, and its hue swings, all on one spring so the
     three arrive and leave together. The spring constants are lifted
     from liquidHello() in script.js so both objects feel the same. */
  /* The reach is in pixels — a gesture made by a hand should cover the
     same span on every screen. The DEPTH cannot be, though, and that is
     the subtle part.

     What makes a dent read as a dent is its size next to the surface's own
     curvature. Across 520px the arc naturally falls about 38px on a
     laptop, so a 57px dimple sits in the same register as the curve. On a
     wide monitor the radius triples and that same span only falls 12px —
     the identical dimple is then five times the local curvature, and stops
     denting the surface: it lifts the whole horizon.

     So the depth is derived from the sagitta over its own reach, which is
     half-reach squared over the radius. It comes out unchanged on a
     laptop and much shallower on a big screen, which is what keeps it
     reading the same. */
  /* The reach follows the viewport width, because the arc does: its chord
     is a fixed multiple of the width, so a gesture covering half a screen
     covers the same share of the sun on any of them. Holding it at a flat
     number of pixels made the dent a smaller and smaller part of a wider
     and wider arc.

     An earlier version also damped the depth by how much of the sphere was
     on screen. That was a patch for the arc changing shape between
     screens, which the chord ratio now prevents — keeping it would only
     thin the dent out for no reason. */
  touchReach: 0.38, // of the viewport width
  touchCurve: 1.2, // depth, as a multiple of the local curvature
  stiffness: 0.14, // higher snaps harder
  damping: 0.76, // < 1 leaves a little overshoot, i.e. elasticity
  follow: 0.18, // how quickly the dent slides to the pointer
  hueCycle: 5000, // ms for a full turn of the local hue
  hueAmount: 0.28, // 0 keeps the colour still and only dents
  huePatchPx: 382, // width of one hue patch, in px — see marblePx
  /* 5.2 radians was most of the colour wheel, so neighbouring patches
     landed on unrelated hues and the sun went iridescent. This keeps them
     in the same family. 0 brings back the concentric rings. */
  hueSpread: 2.0, // radians of hue spread across the patches
  pixelRatio: 1.5, // capped: the disc is large and detail is not the point
};

/* --- shaders ------------------------------------------------------ */

/* Shared by both stages, so the outline and the colour ride the same
   field and cannot drift apart. NOTE: no backticks anywhere in here —
   they would close the template literal and break the module. */
const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      s += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return s;
  }
`;

/* Plain: the outline is a clean circle. An earlier version displaced the
   vertices along their normals to ripple the silhouette, which did not
   work at any amplitude — so the noise now only colours the surface, and
   the vertex stage does no work beyond passing the two varyings. */
const VERT = /* glsl */ `
  uniform vec3 uPoint;
  uniform float uPower;
  uniform float uTouchR;
  uniform float uTouchAmp;

  varying vec3 vN;
  varying vec3 vP;
  varying float vTouch;

  void main() {
    /* The liquid dent, with the same profile as the hello's displacement
       field: compression at the centre, a ring of expansion around it,
       fading to nothing at the rim. The hello has to bake that field into
       an image and sample it; against real geometry it is just arithmetic
       on the distance to the touched point. */
    float dn = clamp(distance(position, uPoint) / uTouchR, 0.0, 1.0);
    float amt = pow(1.0 - dn, 1.6) * sin(dn * 3.14159 * 1.9) * uPower * uTouchAmp;

    /* handed to the fragment stage so the light and the hue ride the very
       same falloff as the deformation, rather than a second one */
    vTouch = (1.0 - dn) * uPower;

    vN = normalize(normalMatrix * normal);
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position * (1.0 + amt), 1.0);
  }
`;

/* The highlight ringing the disc. Its plane is sized so its own edge lands
   exactly where the falloff reaches zero — any gap between the two shows
   up as a hard line across the page, which is how two earlier versions of
   this gave themselves away. */
const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 cGlow;
  uniform float uSpan;
  uniform float uReach;
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    float dr = length(vUv - 0.5) * uSpan;
    /* starts just outside the limb, so the disc keeps its crisp edge */
    /* No squaring here. Multiplying the two ramps already narrows this a
       long way, and putting the result to a power on top of that took the
       peak down to about 5% opacity — present in the buffer, invisible on
       screen. */
    float a = smoothstep(uReach, 1.0, dr) * smoothstep(0.995, 1.02, dr);
    gl_FragColor = vec4(cGlow, a * uAlpha);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 cHot;
  uniform vec3 cCore;
  /* the centre's target colour, --sun-hot pushed toward white by
     --sun-lift. Themed, because how far it may whiten depends on whether
     the type over it is dark or light. */
  uniform vec3 cLift;
  uniform float uTime;
  uniform float uMarble;
  uniform float uContrast;
  uniform float uSoft;
  uniform float uGain;
  uniform float uCentre;
  uniform float uCapFrac;
  uniform float uHue;
  uniform float uHueAmt;
  uniform float uHueScale;
  uniform float uHueSpread;

  varying vec3 vN;
  varying vec3 vP;
  varying float vTouch;

  ${NOISE}

  /* Luma-preserving rotation about the grey axis — the shader equivalent
     of the feColorMatrix hueRotate the hello uses. Written as three dot
     products rather than a mat3 because GLSL builds matrices by column,
     and these coefficients are conventionally written as rows. */
  vec3 hueRotate(vec3 c, float a) {
    float s = sin(a);
    float k = cos(a);
    vec3 r = vec3(0.299 + 0.701 * k + 0.168 * s,
                  0.587 - 0.587 * k + 0.330 * s,
                  0.114 - 0.114 * k - 0.497 * s);
    vec3 g = vec3(0.299 - 0.299 * k - 0.328 * s,
                  0.587 + 0.413 * k + 0.035 * s,
                  0.114 - 0.114 * k + 0.292 * s);
    vec3 b = vec3(0.299 - 0.300 * k + 1.250 * s,
                  0.587 - 0.588 * k - 1.050 * s,
                  0.114 + 0.886 * k - 0.203 * s);
    return clamp(vec3(dot(c, r), dot(c, g), dot(c, b)), 0.0, 1.0);
  }

  void main() {
    /* 1 facing the eye, 0 at the silhouette */
    float mu = clamp(vN.z, 0.0, 1.0);

    /* Normalised distance from the centre of the projected disc: 0 dead
       centre, 1 at the silhouette.

       This matters more than it looks. The cap that clears the page is a
       thin slice of a very large sphere, so the visible band only ever
       spans roughly 0.6 to 1.0 of this — all of it close to the edge.
       Shading straight off mu, as this did at first, therefore painted the
       entire sun with its own limb colour and then darkened it: a luminous
       star rendered as its own dark rim. */
    float d = sqrt(max(0.0, 1.0 - mu * mu));

    /* Marbling sampled ON the sphere, so the plates wrap the body. Two
       octaves at different scales keep the shapes from looking regular. */
    vec3 q = vP * uMarble + vec3(0.0, uTime * 0.7, uTime * 0.5);
    float m = mix(fbm(q), fbm(q * 1.9 + 7.0), 0.4);
    /* pushed apart so the plates read as regions rather than as haze */
    m = smoothstep(0.5 - uContrast, 0.5 + uContrast, m);

    /* ONE colour: the centre's. The ramp used to run out through a warmer
       edge into a deeper gold at the limb, and a darkening term on top of
       that. Both are gone, so the disc reads as a single tone and the
       marbling only ever swings it toward white — never down. */
    /* A soft lift through the middle of the disc, on top of the marbling.

       Normalised over uCapFrac — the share of the radius that actually
       clears the page — so the gradient spans the whole visible arc on
       every screen. Taken raw, (1 - d) only ever reached 0.37 on a laptop
       and 0.12 on a wide monitor, which made this invisible there.

       The target is pushed toward white as well: --sun-core and --sun-hot
       are a few values apart, so mixing between them moved nothing. */
    float u = clamp((1.0 - d) / max(uCapFrac, 0.001), 0.0, 1.0);

    vec3 col = mix(cCore, cHot, m * 0.55);
    col = mix(col, cLift, u * uCentre);
    col *= uGain;

    /* Under the cursor: the surface lifts toward white and its hue swings,
       both on the dent's own falloff. One gesture, three expressions —
       exactly what the hello does with its ripple, tint and sparkles.

       The falloff alone is radially symmetric, though, so every point at
       the same distance got the same hue and the colour came out as
       concentric rings. This second field breaks that symmetry: it offsets
       the hue angle from place to place, so neighbouring patches land on
       different colours and read as a mix rather than as bands. It also
       roughens the touch itself, so the lit area has no clean circular
       boundary. */
    float hn = fbm(vP * uHueScale + vec3(uTime * 1.3, 0.0, uTime * 0.9));

    float touch = smoothstep(0.0, 1.0, vTouch) * (0.72 + 0.56 * hn);
    col = mix(col, cHot, touch * 0.45);
    col = hueRotate(col, (uHue + (hn - 0.5) * uHueSpread) * touch * uHueAmt);

    /* The body still dissolves over the last few pixels. That is a fade in
       opacity, not a darkening — just enough to keep the outline smooth,
       since nothing else antialiases it. */
    float a = smoothstep(1.0, 1.0 - uSoft, d);

    gl_FragColor = vec4(col, a);
  }
`;



/* --- CSS bridge --------------------------------------------------- */
/* A canvas inherits nothing from the stylesheet, so the palette has to be
   carried across by hand. Reading it back from the custom properties (as
   opposed to duplicating the colours here) is what keeps the sun on the
   same theme and the same journey as the rest of the page. */
function readPalette(root) {
  const cs = getComputedStyle(root);
  const pick = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? v : fallback;
  };
  /* Only these two now. --sun-edge and --sun-limb still exist in the
     stylesheet for the CSS fallback sun, but the disc here is a single
     tone, so nothing darker than the centre is carried across. */
  const hot = new THREE.Color(pick("--sun-hot", "#fdf9de"));
  const lift = parseFloat(pick("--sun-lift", "0.5"));

  return {
    hot,
    core: new THREE.Color(pick("--sun-core", "#f9efb8")),
    lift: hot.clone().lerp(WHITE, Number.isFinite(lift) ? lift : 0.5),
  };
}

/* --- build -------------------------------------------------------- */

const WHITE = new THREE.Color(0xffffff);

export function mountSun(host) {
  const root = document.documentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch (e) {
    return false; // no context — the CSS sun stays
  }
  if (!renderer || !renderer.getContext()) return false;

  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOOK.pixelRatio));

  const canvas = renderer.domElement;
  canvas.className = "sun-gl";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  /* Orthographic on purpose: a star this far away has no perspective, and
     it lets the scene be measured in the page's own pixels. */
  /* Depth is set per layout, not here: the sphere's radius follows the
     viewport and can easily exceed any constant. */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);

  const pal = readPalette(root);

  const sunMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      cHot: { value: pal.hot },
      cCore: { value: pal.core },
      cLift: { value: pal.lift },
      uTime: { value: 0 },
      uMarble: { value: 1.35 }, // replaced per layout, from marblePx
      uContrast: { value: LOOK.contrast },
      uSoft: { value: LOOK.softEdge },
      uGain: { value: LOOK.gain },
      uCentre: { value: LOOK.centre },
      uCapFrac: { value: 0.37 }, // replaced per layout: cap / radius
      uPoint: { value: new THREE.Vector3(0, 0, 1) },
      uPower: { value: 0 },
      uTouchR: { value: 0.6 }, // replaced per layout, from touchReach
      uTouchAmp: { value: 0.1 }, // replaced per layout, from touchCurve
      uHue: { value: 0 },
      uHueAmt: { value: LOOK.hueAmount },
      uHueScale: { value: 2.4 }, // replaced per layout, from huePatchPx
      uHueSpread: { value: LOOK.hueSpread },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  /* The silhouette is the one place a low poly count shows, and this one
     is enormous on screen — hence the segment count for a plain sphere. */
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), sunMat);
  sun.renderOrder = 1;
  scene.add(sun);

  const glowMat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      cGlow: { value: pal.hot.clone().lerp(WHITE, LOOK.glowWhite) },
      uSpan: { value: LOOK.glowReach * 2 },
      uReach: { value: LOOK.glowReach },
      uAlpha: { value: LOOK.glowAlpha },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  /* Drawn before the disc, so the body always covers it rather than the
     halo washing over the edge. */
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
  glow.renderOrder = 0;
  scene.add(glow);


  function layout() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);

    /* Radius from the chord and the cap: for a circular segment,
       r = (halfChord^2 + cap^2) / (2 * cap). It comes first because the
       camera's depth is derived from it. */
    const halfChord = (GEO.spanRatio * w) / 2;
    const r = (halfChord * halfChord + GEO.cap * GEO.cap) / (2 * GEO.cap);

    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;

    /* Pulled back past the sphere's own front face. The camera used to sit
       at a flat z = 1000, which was fine while the radius was ~918 — and
       broke the moment the radius grew past it: the near hemisphere ended
       up BEHIND the camera, the near plane sliced it off, and the sun came
       out as a band with sky showing underneath. Under an orthographic
       projection the distance changes nothing about the framing, so there
       is no cost to standing well back. */
    camera.position.z = r * 2;
    camera.far = r * 4;
    camera.updateProjectionMatrix();

    /* drop the whole body below the page, then lift the cap back up */
    const cy = -h / 2 - r + GEO.cap;

    sun.scale.setScalar(r);
    sun.position.set(0, cy, 0);

    /* Clamped so the halo is extinct before the section's top edge clips
       the canvas — the distance to it moves with the viewport height, so a
       constant cannot be trusted. The plane is then sized to end exactly
       where the falloff does. */
    const toTop = (h / 2 - cy) / r;
    const halo = Math.min(LOOK.glowReach, toTop * 0.95);

    glowMat.uniforms.uReach.value = halo;
    glowMat.uniforms.uSpan.value = halo * 2;
    glow.scale.set(r * halo * 2, r * halo * 2, 1);
    glow.position.set(0, cy, 0);

    /* kept for the pointer maths above */
    sunR = r;
    sunY = cy;

    /* The shaders work in sphere radii, so both are converted here. The
       depth goes through the sagitta of the reach, so the dent stays the
       same multiple of how much the surface actually bends across it —
       which is what makes it read as a dimple rather than a bulge. */
    const reach = LOOK.touchReach * w;
    const half = reach / 2;
    const depth = (LOOK.touchCurve * half * half) / r;

    sunMat.uniforms.uTouchAmp.value = depth / r;
    sunMat.uniforms.uTouchR.value = reach / r;

    /* Both noise fields go the same way: a size on screen, divided into
       the radius to give the cycles-per-radius the shaders want. */
    sunMat.uniforms.uMarble.value = r / LOOK.marblePx;
    sunMat.uniforms.uHueScale.value = r / LOOK.huePatchPx;

    /* what fraction of the radius is on screen — the centre lift spans it */
    sunMat.uniforms.uCapFrac.value = GEO.cap / r;

  }

  /* --- the cursor --------------------------------------------------
     With an orthographic camera, finding the point of the sphere under the
     pointer is exact and needs no ray casting: the projection is a plain
     disc, so the front-hemisphere point is (dx, dy, sqrt(1 - dx^2 - dy^2)).
     Anything outside that disc simply releases the effect. */
  let sunR = 1;
  let sunY = 0;

  const touchTarget = new THREE.Vector3(0, 0, 1);
  const touchAt = new THREE.Vector3(0, 0, 1);
  let wantPower = 0;
  let power = 0;
  let powerVel = 0;
  let huePhase = 0;
  let lastNow = 0;

  window.addEventListener(
    "mousemove",
    (e) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width) return;

      /* client pixels -> the scene's own pixel space, which is centred on
         the host with y pointing up */
      const sx = e.clientX - rect.left - rect.width / 2;
      const sy = -(e.clientY - rect.top - rect.height / 2);

      const dx = sx / sunR;
      const dy = (sy - sunY) / sunR;
      const q = dx * dx + dy * dy;

      if (q <= 1) {
        touchTarget.set(dx, dy, Math.sqrt(1 - q));
        wantPower = 1;
      } else {
        wantPower = 0;
      }
      start();
    },
    { passive: true }
  );

  const release = () => {
    wantPower = 0;
    start();
  };
  document.addEventListener("mouseleave", release);
  window.addEventListener("blur", release);

  let running = false;
  let raf = 0;
  const clock = new THREE.Clock();

  function frame() {
    raf = 0;
    if (!running) return;

    const now = performance.now();
    const dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;

    sunMat.uniforms.uTime.value = clock.getElapsedTime() * LOOK.flow;

    /* Spring on the strength, ease on the position — the same split the
       hello uses, so the dent springs in and out with a little overshoot
       while sliding smoothly under a moving pointer. */
    powerVel += (wantPower - power) * LOOK.stiffness;
    powerVel *= LOOK.damping;
    power += powerVel;

    touchAt.lerp(touchTarget, LOOK.follow).normalize();

    sunMat.uniforms.uPower.value = power;
    sunMat.uniforms.uPoint.value.copy(touchAt);

    /* The hue only advances while the surface is actually touched, so each
       approach starts from the sun's own colour rather than from wherever
       a free-running clock had got to. */
    huePhase += (dt / LOOK.hueCycle) * Math.PI * 2 * Math.max(0, power);
    sunMat.uniforms.uHue.value = huePhase;

    renderer.render(scene, camera);
    if (!still) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    clock.start();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    /* or the next frame after a long pause integrates one huge timestep */
    lastNow = 0;
  }

  layout();
  start();

  /* Only burn a frame budget while the finale is actually on screen. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0 }
    ).observe(host);
  }

  window.addEventListener(
    "resize",
    () => {
      layout();
      start();
    },
    { passive: true }
  );

  /* The theme swaps the palette, and a canvas will not hear about it. */
  new MutationObserver(() => {
    const next = readPalette(root);
    sunMat.uniforms.cHot.value = next.hot;
    sunMat.uniforms.cCore.value = next.core;
    sunMat.uniforms.cLift.value = next.lift;
    glowMat.uniforms.cGlow.value = next.hot.clone().lerp(WHITE, LOOK.glowWhite);
    start();
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  return true;
}
