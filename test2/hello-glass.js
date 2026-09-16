/* ---------------------------------------------------------------
   Le "hello" en verre, rendu sur le GPU.

   Remplace la chaîne de 24 primitives SVG de #hGlass. Mesuré : avec le
   filtre vivant, masquer le mot faisait passer la page de 9 fps à 45 —
   il était à lui seul le coût dominant. Aucune primitive de filtre SVG
   (feTurbulence, feDisplacementMap, feSpecularLighting) n'est accélérée
   par le GPU dans aucun navigateur ; elles tournent sur le CPU, à chaque
   frame, tant que quelque chose bouge. Et .hello-drift ne s'arrête
   jamais. Ici tout est un seul fragment shader.

   DEUX CHOIX STRUCTURELS, et ce sont eux qui font la performance, pas
   le réglage du shader :

   1. Le canvas couvre le MOT, pas la fenêtre. Un prototype plein écran
      mesurait 22 fps ; la boîte du mot représente moins d'un cinquième
      des pixels du héros.

   2. Rien n'est rendu au repos. Le ciel de réfraction est cuit UNE fois
      dans une cible au montage — nuages compris, mais figés. Plus rien
      n'anime le canvas de lui-même, donc la boucle se gare et la page
      ne paie rien tant que le curseur n'approche pas. Les nuages CSS
      derrière continuent de dériver, ceux vus à travers le verre non :
      personne ne compare deux images au travers d'une déformation.
   --------------------------------------------------------------- */

import * as THREE from "./vendor/three.module.js";

const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* Le dégradé du ciel vient des variables CSS, pas de constantes copiées :
   ce sont des color-mix() pilotés par --warmth, donc getPropertyValue
   rendrait le jeton brut et non la couleur. Une sonde jetable les fait
   résoudre par le moteur de style.

   ELLE DOIT VIVRE DANS .sky. Les quatre variables sont déclarées sur
   .sky dans sky.css, pas sur :root — posée ailleurs, la sonde ne les
   résout pas, background-color reste invalide et getComputedStyle rend
   "rgba(0, 0, 0, 0)". Ce que le premier jet lisait comme du noir opaque :
   le mot sortait en verre fumé sur un ciel bleu.

   D'où aussi le test sur l'alpha plus bas : une couleur transparente est
   le signal d'une variable non résolue, pas une couleur à utiliser. */
const SKY_FALLBACK = {
  high: [0.37, 0.64, 0.91], mid: [0.60, 0.79, 0.95],
  band: [0.78, 0.89, 0.98], low: [0.86, 0.93, 0.98],
};

function readSky() {
  const sky = document.querySelector(".sky");
  if (!sky) return SKY_FALLBACK;

  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
  sky.appendChild(probe);

  /* Un canvas 1x1 comme convertisseur, et ce n'est pas du zèle.

     getComputedStyle ne rend PAS du rgb() ici : le résultat d'un
     color-mix(in oklab, ...) revient en notation oklab, par exemple
     "oklab(0.699707 -0.0415377 -0.116144)". Lu avec un regex de nombres,
     ça donnait 0.69 / 0.04 / 0.11 divisés par 255 — soit du noir, et le
     mot sortait en verre fumé sur un ciel bleu.

     Peindre la couleur et relire le pixel délègue la conversion au
     moteur, qui sait le faire pour toutes les notations, présentes et à
     venir. */
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });

  const get = (name, fb) => {
    probe.style.backgroundColor = "";
    probe.style.backgroundColor = `var(${name})`;
    const css = getComputedStyle(probe).backgroundColor;
    if (!css || css === "rgba(0, 0, 0, 0)") return fb; /* variable non résolue */

    /* Sentinelle : un fillStyle que le canvas refuse est ignoré en
       silence et garde sa valeur précédente. Sans ce test, une notation
       non supportée rendrait la couleur du tour d'avant. */
    cx.fillStyle = "#ff00ff";
    cx.fillStyle = css;
    if (cx.fillStyle === "#ff00ff") return fb;

    cx.clearRect(0, 0, 1, 1);
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 8) return fb;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };

  const out = {
    high: get("--sky-high", SKY_FALLBACK.high),
    mid: get("--sky-mid", SKY_FALLBACK.mid),
    band: get("--sky-band", SKY_FALLBACK.band),
    low: get("--sky-low", SKY_FALLBACK.low),
  };
  probe.remove();
  return out;
}

const SKY_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uHigh, uMid, uBand, uLow;
  uniform vec2 uOrigin, uSpan;   /* place du canvas dans le viewport */

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    /* Le dégradé CSS court sur toute la hauteur du viewport, pas sur ce
       canvas : sans ce remap, le mot porterait un dégradé complet au lieu
       de la tranche qui lui revient, et la couleur trancherait net au
       bord du verre. */
    vec2 p = uOrigin + vUv * uSpan;

    /* t EST p.y, pas son complément.

       uOrigin/uSpan placent déjà le canvas en repère GL, où y = 1 est le
       haut de l'écran — donc le zénith. Le complément lisait le dégradé
       à l'envers : le mot, dans le tiers haut de la page, récupérait la
       tranche BASSE, entre --sky-low (0.87 0.93 0.98, presque blanc) et
       --sky-mid. --sky-high, le seul bleu franc des quatre, n'était
       jamais atteint. Le verre ne pouvait donc réfléchir et réfracter que
       du blanc : d'où un mot pâle et sans relief, alors que le même
       shader au labo, sur un ciel correctement orienté, a du contraste.

       Le même t conditionne les nuages plus bas, qui étaient étouffés
       par la même erreur. */
    float t = clamp(p.y, 0.0, 1.0);

    vec3 c = mix(uLow, uBand, smoothstep(0.0, 0.28, t));
    c = mix(c, uMid, smoothstep(0.28, 0.58, t));
    c = mix(c, uHigh, smoothstep(0.58, 1.0, t));

    /* Des nuages, et pas par décoration : une réfraction ne se VOIT que
       s'il y a de la structure derrière à déplacer. Sur un dégradé lisse,
       du bleu décalé reste le même bleu et toute la distorsion est
       invisible quelle que soit sa force.

       Leur échelle est prise en vUv, c'est-à-dire LOCALE au canvas, pas
       en p qui est la position dans le viewport. Le dégradé, lui, reste
       en p pour rester continu avec le ciel CSS. Calculés en p, les
       motifs suivaient la taille de l'écran : comme le mot n'en occupe
       qu'un bout, un nuage couvrait plusieurs lettres et il ne restait
       aucune structure à l'échelle du trait — c'est ce qui rendait le
       verre plus fade qu'au labo. */
    vec2 q = vec2(vUv.x * 2.2, vUv.y * 1.35);
    float cl = smoothstep(0.42, 0.72, fbm(q * 2.6)) * smoothstep(0.02, 0.50, t);
    float cl2 = smoothstep(0.55, 0.78, fbm(q * 5.5)) * cl;
    c = mix(c, vec3(1.0), cl * 0.92);
    c = mix(c, vec3(1.0), cl2 * 0.50);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const GLASS_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMask, uField, uSky;
  uniform vec2 uTexel, uMouse, uPoint;
  uniform float uThick, uRefract, uDisp, uIrid, uRefl, uHover;
  uniform float uPower, uAspect, uClear, uDark;

  vec3 sky(vec2 uv) { return texture2D(uSky, clamp(uv, 0.0015, 0.9985)).rgb; }
  float field(vec2 uv) { return texture2D(uField, uv).a; }

  /* LE PROFIL, et c'est lui qui décide si on lit du verre ou un voile.
     Un champ flouté donne un dôme : pente douce partout, donc normale
     faible partout, donc une nappe de lumière diffuse. Une pièce de verre
     est une FACE PLATE bordée d'un BISEAU court — toute la variation est
     comprimée dans une bande étroite près du bord. Au-delà, plateau : le
     ciel se voit droit au travers, comme par une vitre. */
  float prof(float x) {
    /* Bande élargie depuis que le champ est redécoupé par la lettre.
       La découpe fait tomber le champ à zéro sur tous les bords, donc la
       plage 0.42..0.76 ne couvrait plus que quelques pixels : tout le
       Fresnel et toute l'irisation s'y entassaient et le biseau se
       lisait comme un ruban arc-en-ciel au lieu d'une arête de verre. */
    return smoothstep(0.26, 0.88, x) * 0.80 + smoothstep(0.0, 1.0, x) * 0.20;
  }
  /* Le même champ lu plus profond : l'arête opposée, vue à travers
     l'épaisseur. Une seule arête donne un galet, deux donnent du volume.
     Gratuit — on réutilise les quatre lectures déjà faites. */
  float profIn(float x) { return smoothstep(0.66, 0.95, x); }

  /* Interférences en lame mince : le reflet de bulle. À ne pas confondre
     avec la dispersion, qui sépare les couleurs en RÉFRACTION. Celle-ci
     les fait naître dans le REFLET, et la phase suit le chemin optique —
     plus la surface est vue de biais, plus la teinte défile. */
  vec3 iridescence(float cosT, float thick) {
    float phase = thick / max(cosT, 0.18);
    return 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, -0.33, -0.67)));
  }

  void main() {
    vec2 uv = vUv;

    /* Le halo est calculé AVANT les lectures : il ne teinte pas, il
       déplace les coordonnées où l'on lit le masque et le champ. C'est la
       différence entre colorer la matière et déformer la FORME — et comme
       son amplitude vient d'un ressort, la silhouette dépasse puis
       revient. */
    vec2 dv = (uv - uPoint) * vec2(uAspect, 1.0);
    float g = smoothstep(0.30, 0.0, length(dv)) * uPower;
    float ring = g * (1.0 - g) * 4.0;
    vec2 wuv = uv - normalize(dv + 1e-5) * ring * 0.030 * uHover
                    / vec2(uAspect, 1.0);

    float cover = texture2D(uMask, wuv).a;
    if (cover < 0.004) discard;   /* hors des lettres : le CSS passe */

    float dith = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))
                  * 43758.5453) - 0.5) / 255.0;

    vec2 e = uTexel * 5.0;
    float sR = field(wuv + vec2(e.x, 0.0)) + dith;
    float sL = field(wuv - vec2(e.x, 0.0)) + dith;
    float sU = field(wuv + vec2(0.0, e.y)) + dith;
    float sD = field(wuv - vec2(0.0, e.y)) + dith;
    float hc = field(wuv) + dith;

    /* Amplification abaissée de 9 à 6.5 : la découpe du champ par la
       lettre a raidi toutes les pentes, bord extérieur compris. À
       l'ancienne valeur les normales saturaient et l'arête partait en
       dents de scie. */
    vec3 N = normalize(vec3(-(prof(sR) - prof(sL)) * 6.5 * uThick,
                            -(prof(sU) - prof(sD)) * 6.5 * uThick, 1.0));
    N = normalize(vec3(N.xy + normalize(dv + 1e-5) * ring * 1.25 * uHover, N.z));

    vec3 Nin = normalize(vec3(-(profIn(sR) - profIn(sL)) * 7.0 * uThick,
                              -(profIn(sU) - profIn(sD)) * 7.0 * uThick, 1.0));

    /* Exposant bas : à 2.2 le reflet ne vivait que sur la pente la plus
       raide, un liseré de quelques pixels, et le reste restait en
       transmission pure. */
    float F = pow(1.0 - clamp(N.z, 0.0, 1.0), 1.5);

    vec2 off = N.xy * uRefract * 1.30 * (1.0 + g * 1.8 * uHover);
    float d = uDisp * 0.14 * (1.0 + g * 7.0 * uHover);
    vec3 refr = vec3(sky(uv + off * (1.0 - d)).r,
                     sky(uv + off).g,
                     sky(uv + off * (1.0 + d)).b);

    /* Vrai reflet d'environnement : la direction réfléchie décide de ce
       qu'on voit, donc il BALAYE quand la source bouge, au lieu de rester
       collé au fond. */
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
    vec3 refl = sky(uv + R.xy * 0.55 * uRefl);

    vec3 irid = iridescence(clamp(N.z, 0.0, 1.0),
                            0.42 + prof(hc) * 1.15 + g * 3.0 * uHover);
    refl = mix(refl, refl * 0.45 + irid * 0.72,
               clamp(uIrid * 0.85 + g * 0.5 * uHover, 0.0, 1.0));

    vec3 L = normalize(vec3((uMouse - 0.5) * 1.9, 0.42));
    vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));

    /* La source vue dans le reflet : la grande tache claire qui manquait
       pour qu'on perçoive une réflexion plutôt qu'une teinte. */
    refl += vec3(1.0, 0.97, 0.92)
          * pow(max(dot(normalize(R), L), 0.0), 7.0) * 1.35 * uRefl;

    /* Éclat masqué par la PENTE. Sans ce masque, sur la face plate
       (N = 0,0,1) le demi-vecteur s'aligne sur la normale et pow(dot, n)
       vaut 1 sur toute la surface : elle partait en blanc. */
    float slope = smoothstep(0.03, 0.30, 1.0 - clamp(N.z, 0.0, 1.0));

    /* Les éclats portent bien plus fort de nuit, et c'est physique autant
       qu'esthétique : le Fresnel ne réfléchit que ce qui est là, et le
       ciel de nuit est noir. Ce qui fait lire "verre" dans le sombre, ce
       sont les points de lumière qu'il attrape, pas les reflets. Sans ce
       gain, le mot devenait une masse sombre. */
    float gain = mix(1.0, 2.1, uDark);
    float spec = pow(max(dot(N, Hv), 0.0), 220.0) * 2.2 * slope * gain;

    vec3 L2 = normalize(vec3(-(uMouse - 0.5) * 1.5, 0.55));
    vec3 Hv2 = normalize(L2 + vec3(0.0, 0.0, 1.0));
    float slopeIn = smoothstep(0.02, 0.26, 1.0 - clamp(Nin.z, 0.0, 1.0));
    float specIn = pow(max(dot(Nin, Hv2), 0.0), 60.0) * 0.85 * slopeIn * gain;
    vec3 iridIn = iridescence(clamp(Nin.z, 0.0, 1.0), 0.9 + prof(hc) * 0.8);

    vec3 glass = mix(refr, refl, clamp(F * 0.95 * uRefl, 0.0, 0.92));
    glass += specIn * mix(vec3(1.0), iridIn, uIrid * 0.8);

    /* L'IRISATION SUR TOUT LE CORPS, et plus seulement sur l'arête.

       Elle n'entrait jusqu'ici que dans refl, lequel n'est mélangé qu'à
       travers le Fresnel — nul sur le plateau. La couleur ne vivait donc
       que sur un liseré de quelques pixels. Or une bulle est irisée
       partout : son film est mince sur toute sa surface, et la teinte y
       suit l'ÉPAISSEUR autant que l'angle.

       D'où la phase prise sur prof(hc), l'épaisseur traversée, avec assez
       d'amplitude (2.4) pour parcourir plusieurs bandes au lieu d'un seul
       dégradé — c'est la succession des bandes qui fait lire "bulle"
       plutôt que "teinte". Le Fresnel ne fait plus que renforcer sur le
       bord au lieu de tout conditionner. */
    /* Le multiplicateur de phase est un compromis, pas un réglage libre.
       Il fixe le nombre de bandes — il en faut plus d'une pour lire
       "bulle" — mais il amplifie d'autant la quantification du champ, qui
       est un alpha 8 bits : à 2.4 les marches d'1/255 ressortaient en
       stries dures et en escalier le long des biseaux. 1.5 garde deux
       bandes franches sans les faire apparaître.

       Et la phase reçoit son propre dither, bien plus large que celui des
       normales : c'est elle qui subit l'amplification, donc c'est elle
       qu'il faut brouiller sous le seuil visible. */
    float pdith = (fract(sin(dot(gl_FragCoord.yx, vec2(39.3468, 11.135)))
                   * 24634.6345) - 0.5) * 0.020;
    vec3 iridAll = iridescence(clamp(N.z, 0.0, 1.0),
                               0.30 + prof(hc) * 0.95 + pdith + g * 1.4 * uHover);
    glass = mix(glass, glass * 0.62 + iridAll * 0.72,
                clamp(uIrid * (0.26 + 0.74 * F), 0.0, 1.0));
    glass *= 1.0 - smoothstep(0.15, 0.75, F) * 0.16;
    glass += spec;

    /* L'ALPHA EST LA TRANSPARENCE, et c'est ici que le héros diffère du
       labo par nature.

       Au labo, le verre est composé sur le ciel qu'il réfracte : une
       seule image, tout est cohérent. Ici le navigateur le compose sur le
       vrai ciel CSS, alors que la couleur peinte vient de ma texture. En
       sortant opaque, mon ciel REMPLAÇAIT le tien dans tout le corps des
       lettres — le mot se lisait comme un objet posé dessus, pas comme du
       verre, et ses nuages ne bougeaient pas avec les vrais.

       Une vitre plate transmet presque tout. Donc l'alpha suit le
       Fresnel : faible sur le plateau, où le ciel RÉEL repasse au travers
       avec ses propres nuages, et fort sur le biseau, les reflets et les
       éclats — là où le verre a effectivement quelque chose à ajouter.
       Le corps plat ne réfracte de toute façon presque rien, sa normale
       y étant verticale : on ne perd donc pas la distorsion.

       La rampe est RAIDE, et c'est ce qui manquait au premier essai.
       Elle suivait F directement, or F = pow(1 - N.z, 1.5) n'atteint
       jamais vraiment 1 : même en plein biseau l'alpha plafonnait vers
       0.7-0.9, et reflets comme assombrissement d'arête se retrouvaient
       dilués d'un quart dans le ciel. C'est précisément l'amplitude
       tonale à l'intérieur du trait qui disparaissait — le verre sortait
       uniformément pâle là où il doit avoir un cœur clair et des bords
       denses. Le corps plat, lui, ne perd rien à être transparent : ce
       qu'il peint y est déjà presque le ciel. */
    float solid = smoothstep(0.0, 0.38, F);
    /* Moins transparent de nuit : laisser passer la moitié d'un ciel noir
       vide le verre de sa matière, alors que de jour le ciel qui traverse
       EST ce qui le fait vivre. */
    float clear = uClear * mix(1.0, 0.62, uDark);
    /* L'irisation remonte un peu l'alpha : peinte sur un corps à demi
       transparent, sa couleur se diluait de moitié dans le ciel et
       retombait au gris pâle qu'elle est censée remplacer. */
    float a = mix(1.0 - clear, 1.0, solid) + spec * 0.9 + specIn * 0.7
            + uIrid * 0.14;
    gl_FragColor = vec4(glass, smoothstep(0.30, 0.62, cover) * clamp(a, 0.0, 1.0));
  }
`;

/* Marge autour de la boîte du mot, en fraction de ses côtés.

   Le canvas ne peut pas épouser .hello : le SVG qu'il remplace portait
   overflow:visible, et son halo comme ses lettres débordaient du gabarit.
   Calé à ras, le mot se faisait couper en haut à gauche et en bas dès
   qu'on lui rendait sa taille et son inclinaison d'origine.

   style.css place .hello-gl avec exactement ces valeurs en négatif — les
   deux jeux ne font qu'un, changer l'un sans l'autre décale le mot. */
const PAD_X = 0.10;
const PAD_Y = 0.22;

/* Descente du mot dans sa boîte, en pixels CSS.

   Appliqué au DESSIN, pas au canvas. Décaler le canvas en CSS
   désalignerait le test de présence du curseur, qui rapporte le pointeur
   à la boîte de .hello : en bougeant le texte, le masque bouge avec lui
   et le repère reste cohérent.

   Le SVG d'origine posait sa ligne de base à y=300 dans un gabarit de
   420, soit un mot centré vers 63% de la hauteur ; celui-ci est centré à
   50%. Cette descente rattrape une partie de cet écart. */
const DROP_PX = 30;

export function mountGlass(hello, word) {
  /* premultipliedAlpha reste à true, sa valeur par défaut, et ce n'est
     pas un détail. Le mélange normal de three.js écrit SRC_ALPHA /
     ONE_MINUS_SRC_ALPHA dans un tampon vide : le résultat y est donc
     RGB x alpha, c'est-à-dire prémultiplié. Déclarer l'inverse au
     contexte fait lire ces valeurs comme de la couleur droite par le
     compositeur, et tout ce qui est partiellement transparent ressort
     assombri d'autant — le verre virait au gris fumé dès qu'on lui
     donnait de la transparence. */
  /* Pas de survol sans pointeur fin : le canvas ne changera donc jamais
     après sa première frame, et le faire vivre ne sert à rien. Il sera
     gelé en image, ce qui impose de préserver le tampon de dessin —
     toDataURL rend une image vide une fois que le compositeur l'a
     récupéré. */
  const FINE = window.matchMedia("(pointer: fine)").matches;
  const renderer = new THREE.WebGLRenderer({
    alpha: true, antialias: false, preserveDrawingBuffer: !FINE });
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return null; }

  const DPR = Math.min(1.75, window.devicePixelRatio || 1);
  renderer.setPixelRatio(DPR);
  const canvas = renderer.domElement;
  canvas.className = "hello-gl";
  canvas.setAttribute("aria-hidden", "true");

  /* DANS .hello-drift, pas dans .hello. C'est là que vivaient le SVG et
     ses deux mouvements : l'inclinaison de -2.6° et la dérive de 19s.
     Posé un cran au-dessus, le canvas n'héritait ni de l'une ni de
     l'autre — le mot sortait parfaitement droit et figé.

     Ça ne coûte rien : le contenu du canvas ne change pas, seule une
     transformation composée le déplace, ce que le GPU fait pour rien. Et
     le parallaxe du curseur, porté par .hello-tilt encore au-dessus,
     revient par la même occasion. */
  (hello.querySelector(".hello-drift") || hello).appendChild(canvas);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = () => new THREE.PlaneGeometry(2, 2);

  const skyU = {
    uHigh: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uBand: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
    uOrigin: { value: new THREE.Vector2() }, uSpan: { value: new THREE.Vector2(1, 1) },
  };
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(quad(), new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: VERT, fragmentShader: SKY_FRAG })));
  let skyTarget = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false });

  const U = {
    uMask: { value: null }, uField: { value: null }, uSky: { value: skyTarget.texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.58) },
    uPoint: { value: new THREE.Vector2(0.5, 0.5) },
    uThick: { value: 0.62 }, uRefract: { value: 0.82 }, uDisp: { value: 0.40 },
    uIrid: { value: 0.66 }, uRefl: { value: 0.70 }, uHover: { value: 0.70 },
    uPower: { value: 0 }, uAspect: { value: 1 },
    /* Part du ciel RÉEL laissée visible à travers le corps plat. */
    uClear: { value: 0.52 }, uDark: { value: 0 },
  };
  const glassScene = new THREE.Scene();
  glassScene.add(new THREE.Mesh(quad(), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: GLASS_FRAG,
    transparent: true, depthTest: false })));

  /* ---------- le mot, en deux textures ---------- */
  let maskTex = null, fieldTex = null, hit = null, hitW = 0, hitH = 0;
  let W = 0, H = 0, boxW = 0;

  function build() {
    const box = hello.getBoundingClientRect();
    if (!box.width || !box.height) return false;

    /* Le canvas est plus grand que la boîte ; le MOT, lui, reste
       dimensionné sur la boîte, pas sur le canvas — sans quoi la marge
       le grossirait d'autant. */
    const cw = Math.round(box.width * (1 + PAD_X * 2));
    const ch = Math.round(box.height * (1 + PAD_Y * 2));
    renderer.setSize(cw, ch, false);
    W = Math.round(cw * DPR); H = Math.round(ch * DPR);
    boxW = Math.round(box.width * DPR);
    U.uTexel.value.set(1 / W, 1 / H);
    U.uAspect.value = W / H;

    const mask = document.createElement("canvas");
    mask.width = W; mask.height = H;

    /* Le champ est rendu en DEMI-résolution, et c'est un gain de qualité,
       pas une économie.

       Il est stocké en alpha 8 bits. À pleine résolution, un texel tombe
       sur un pixel écran : le GPU restitue les paliers tels quels, et sur
       des pentes aussi douces ils ressortent en fin striage le long des
       biseaux — que l'irisation amplifie ensuite. Sous-échantillonné, le
       filtrage bilinéaire interpole ENTRE les paliers, en flottant, et
       rend une pente continue. Le champ n'a de toute façon aucun détail
       fin à perdre : c'est un flou. */
    const FW = Math.max(2, W >> 1), FH = Math.max(2, H >> 1);
    const field = document.createElement("canvas");
    field.width = FW; field.height = FH;

    /* La taille de POLICE n'est pas la largeur du MOT : "hello" en
       Pacifico fait environ 2,4 fois sa taille de police. On mesure. */
    const ctx = mask.getContext("2d");
    const REF = 200;
    ctx.font = REF + "px Pacifico, cursive";
    const wordW = ctx.measureText(word).width || REF * 2.4;
    /* Calé sur l'original : le SVG pose 300px de police dans un gabarit
       de 960 de large, soit un mot qui occupe environ 75% de la boîte.
       Le premier jet plafonnait à H*0.52, et c'est ce plafond qui mordait
       — il rendait 0.227 fois la largeur au lieu de 0.3125, le mot
       sortait un quart trop petit. Le plafond de hauteur ne doit servir
       que de garde-fou, pas de valeur de travail. */
    const size = Math.min((boxW * 0.75 * REF) / wordW, H * 0.86);

    const paint = (c, w, h, k) => {
      c.clearRect(0, 0, w, h);
      /* Ce rayon EST la largeur du biseau, le réglage le plus sensible du
         fichier : trop grand, plus de face plate et le liseré s'étale en
         contour peint. Mis à l'échelle avec la cible, pour que le biseau
         garde la même largeur relative quelle que soit la résolution. */
      const blur = size * 0.045 * k;
      c.filter = blur > 0.5 ? "blur(" + blur + "px)" : "none";
      c.fillStyle = "#fff";
      c.textAlign = "center"; c.textBaseline = "middle";
      c.font = (size * k) + "px Pacifico, cursive";
      c.fillText(word, w / 2, h / 2 + DROP_PX * DPR * k);
      c.filter = "none";
    };
    ctx.filter = "none";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = size + "px Pacifico, cursive";
    ctx.clearRect(0, 0, W, H);
    ctx.fillText(word, W / 2, H / 2 + DROP_PX * DPR);

    const fx = field.getContext("2d");
    paint(fx, FW, FH, FW / W);

    /* LE CHAMP EST REDÉCOUPÉ PAR LA LETTRE, et c'est ce qui rend leur
       dessin aux boucles.

       Un flou gaussien ne connaît pas les contrepoinçons : dans le "e",
       le "o", les boucles des "l", le flou des traits qui se font face se
       rejoint et REMPLIT le trou. Le champ y voyait une masse pleine,
       donc aucune pente ne s'y formait — pas de biseau sur les bords
       intérieurs, et la boucle se lisait comme un aplat.

       La silhouette n'était pas en cause : le masque est net et on
       découpe dessus. C'était l'ombrage.

       destination-in multiplie l'alpha déjà en place par celui qu'on
       dessine : en repassant la lettre à peine floutée, le champ tombe à
       zéro partout où il n'y a pas de matière, trous compris. Les pentes
       se reforment donc sur TOUS les bords, intérieurs comme extérieurs.
       Fait une fois à la construction, gratuit au rendu.

       Le flou de la découpe est petit mais non nul : à zéro, le bord du
       champ épouserait l'escalier du masque et la normale y partirait en
       dents de scie. */
    fx.globalCompositeOperation = "destination-in";
    fx.filter = "blur(" + Math.max(2, size * 0.034 * (FW / W)) + "px)";
    fx.fillStyle = "#fff";
    fx.textAlign = "center"; fx.textBaseline = "middle";
    fx.font = (size * (FW / W)) + "px Pacifico, cursive";
    fx.fillText(word, FW / 2, FH / 2 + DROP_PX * DPR * (FW / W));
    fx.filter = "none";
    fx.globalCompositeOperation = "source-over";

    if (maskTex) { maskTex.dispose(); fieldTex.dispose(); }
    maskTex = new THREE.CanvasTexture(mask);
    fieldTex = new THREE.CanvasTexture(field);
    for (const t of [maskTex, fieldTex]) {
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    U.uMask.value = maskTex; U.uField.value = fieldTex;

    /* Vignette pour le test de présence : getImageData par mousemove
       serait une relecture GPU à chaque mouvement. */
    hitW = 300; hitH = Math.max(1, Math.round((H / W) * hitW));
    const hc = document.createElement("canvas");
    hc.width = hitW; hc.height = hitH;
    const hx = hc.getContext("2d");
    hx.drawImage(mask, 0, 0, hitW, hitH);
    hit = hx.getImageData(0, 0, hitW, hitH).data;

    skyTarget.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1));
    U.uSky.value = skyTarget.texture;
    bakeSky(box);
    return true;
  }

  /* Le ciel n'est PAS rendu par frame : une fois ici, et seulement quand
     sa couleur ou la place du mot changent. C'est ce qui permet à la
     boucle de se garer complètement au repos. */
  function bakeSky(box) {
    U.uDark.value = document.documentElement.dataset.theme === "dark" ? 1 : 0;
    const c = readSky();
    skyU.uHigh.value.setRGB(...c.high); skyU.uMid.value.setRGB(...c.mid);
    skyU.uBand.value.setRGB(...c.band); skyU.uLow.value.setRGB(...c.low);
    const b = box || hello.getBoundingClientRect();

    /* La texture couvre une tranche de ciel PLUS LARGE que le mot, centrée
       sur lui. Calée pile sur sa boîte, elle ne contenait qu'un fragment du
       dégradé — presque plat — et déplacer l'échantillon de quelques
       pourcents y ramenait la même couleur : la réfraction ne se voyait
       pas, quelle que soit sa force. Ce n'est pas une infidélité : cette
       texture ne sert QU'À être réfractée et réfléchie à l'intérieur des
       lettres, jamais à peindre le fond, que le ciel CSS assure. Un verre
       épais montre de toute façon un morceau de monde plus large que
       lui. */
    const Z = 1.9;
    const cxv = (b.left + b.width / 2) / innerWidth;
    const cyv = 1 - (b.top + b.height / 2) / innerHeight;
    const sw = (b.width / innerWidth) * Z;
    const sh = (b.height / innerHeight) * Z;
    skyU.uOrigin.value.set(cxv - sw / 2, cyv - sh / 2);
    skyU.uSpan.value.set(sw, sh);
    renderer.setRenderTarget(skyTarget);
    renderer.render(skyScene, camera);
    renderer.setRenderTarget(null);
  }

  /* ---------- ressort ---------- */
  const STIFF = 0.14, DAMP = 0.76;   /* damping < 1 => dépassement, le rebond */
  let px = 0.5, py = 0.5, cx = 0.5, cy = 0.5, vx = 0, vy = 0;
  let power = 0, pvel = 0, want = 0;

  const onLetter = (nx, ny) => {
    if (!hit) return false;
    const i = (Math.min(hitH - 1, (ny * hitH) | 0) * hitW
             + Math.min(hitW - 1, (nx * hitW) | 0)) * 4 + 3;
    return hit[i] > 40;
  };

  /* Une fois gelé, le contexte WebGL est libéré : tout ce qui touche au
     renderer doit cesser. Sans ce drapeau, le recuit du ciel au scroll
     et le redimensionnement continuaient d'appeler render() sur un
     contexte mort — d'où une exception dans three au premier scroll. */
  let dead = false;
  let running = false, raf = 0, visible = true, box = null;

  function wake() {
    if (dead || running || !visible) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function frame() {
    raf = 0;
    pvel += (want - power) * STIFF; pvel *= DAMP; power += pvel;
    vx += (px - cx) * STIFF; vx *= DAMP; cx += vx;
    vy += (py - cy) * STIFF; vy *= DAMP; cy += vy;
    U.uPower.value = Math.max(0, power);
    U.uPoint.value.set(cx, cy);
    renderer.render(glassScene, camera);

    /* Parqué dès que tout est immobile — pas "dès que le curseur est
       parti". Un pointeur posé sur une lettre tient le ressort à
       l'équilibre : sans ce test on brûlerait une frame toutes les 16ms
       pour redessiner une image qui ne change plus. */
    const still = Math.abs(want - power) < 0.002 && Math.abs(pvel) < 0.002
               && Math.abs(px - cx) < 0.002 && Math.abs(py - cy) < 0.002;
    if (still) { running = false; return; }
    raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
    box = box || hello.getBoundingClientRect();
    /* Le pointeur est rapporté à la boîte de .hello — non tournée, donc
       le calcul reste trivial — puis converti en uv du canvas, qui est
       plus grand qu'elle de la marge. Mesurer sur le canvas lui-même
       obligerait à défaire la rotation de .hello-drift pour un gain nul :
       2.6° déplacent le point de quelques pixels, sous la résolution du
       test de présence. */
    const bx = (e.clientX - box.left) / box.width;
    const by = (e.clientY - box.top) / box.height;
    const nx = (bx + PAD_X) / (1 + PAD_X * 2);
    const ny = (by + PAD_Y) / (1 + PAD_Y * 2);
    U.uMouse.value.set(nx, 1 - ny);
    px = nx; py = 1 - ny;
    want = bx >= -PAD_X && bx <= 1 + PAD_X && by >= -PAD_Y && by <= 1 + PAD_Y
           && onLetter(nx, ny) ? 1 : 0;
    wake();
  }
  const release = () => { want = 0; wake(); };

  if (FINE) addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", release);
  addEventListener("blur", release);
  addEventListener("scroll", () => { box = null; }, { passive: true });

  let resizeT = 0;
  addEventListener("resize", () => {
    box = null;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (!dead && build()) { wake(); frame(); } }, 140);
  }, { passive: true });

  /* Le ciel change de couleur au scroll (--warmth) et au flip de thème.
     Recuit à la volée plutôt qu'en continu : une fois par pas, pas par
     frame. */
  let skyT = 0;
  const refreshSky = () => {
    clearTimeout(skyT);
    skyT = setTimeout(() => {
      if (dead) return;
      box = null; bakeSky(); renderer.render(glassScene, camera);
    }, 60);
  };
  addEventListener("scroll", refreshSky, { passive: true });
  new MutationObserver(refreshSky).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"] });

  /* Hors du héros, zéro frame — comme sun3d.js. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
      else if (visible && !dead) wake();
    }, { rootMargin: "120px" }).observe(hello);
  }

  if (!build()) { renderer.dispose(); canvas.remove(); return null; }
  renderer.render(glassScene, camera);

  /* MOBILE — un rendu, puis une image, puis plus de WebGL du tout.

     Mesuré sur un iPhone émulé : la page tombait de 19 à 3 fps. Le
     shader n'y est pour rien, la boucle s'y garait déjà faute de survol.
     Ce qui coûtait, c'est la COMPOSITION : un grand canvas WebGL
     transparent, à DPR 3, repris à chaque frame de scroll. Et sur
     téléphone le mot occupe 86% de la largeur, donc l'économie du
     "canvas à la taille du mot" ne joue plus.

     Une <img> se compose bien plus efficacement qu'un canvas WebGL, et
     le rendu est au pixel près le même puisqu'il sort du même shader.
     Le contexte est libéré derrière, ce qui rend aussi sa mémoire. */
  function freeze() {
    let url;
    try { url = canvas.toDataURL("image/png"); } catch (e) { return; }
    const img = new Image();
    img.className = "hello-gl";
    img.alt = "";
    img.decoding = "async";
    img.setAttribute("aria-hidden", "true");
    img.onload = () => {
      dead = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      running = false;
      canvas.replaceWith(img);
      skyTarget.dispose();
      if (maskTex) { maskTex.dispose(); fieldTex.dispose(); }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
    };
    img.src = url;
  }
  if (!FINE) { freeze(); return { frozen: true }; }

  return { canvas, renderer };
}
