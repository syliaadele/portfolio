/* ---------------------------------------------------------------
   Pulls the portfolio's images off Adobe's CDN into this repo, so the
   site stops depending on an account we do not control.

   Two things the CDN enforces, both found the hard way:
     - every URL carries a ?h= hash, and the hash covers the _rw_<size>
       segment. Asking for a bigger variant than the page lists returns
       403, so each image is taken at the largest size actually offered.
     - the CDN wants a Referer from the portfolio domain.

   Usage:  node tools/harvest.mjs <destination> <slug> [slug...]
   --------------------------------------------------------------- */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SITE = "https://syliaadelelakrib.myportfolio.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: SITE + "/",
};

const [dest, ...slugs] = process.argv.slice(2);
if (!dest || !slugs.length) {
  console.error("usage: node tools/harvest.mjs <destination> <slug> [slug...]");
  process.exit(1);
}

/* Group every variant by the image's own id and keep the widest. The id is
   the uuid before _rw_, which is stable across sizes. */
function widestPerImage(html) {
  const re =
    /https:\/\/cdn\.myportfolio\.com\/[^\s"']+?\/([0-9a-f-]{16,})_rw_(\d+)\.(jpg|jpeg|png|webp|gif)\?h=[a-f0-9]+/g;
  const best = new Map();
  for (const m of html.matchAll(re)) {
    const [url, id, size, ext] = [m[0], m[1], Number(m[2]), m[3]];
    const cur = best.get(id);
    if (!cur || size > cur.size) best.set(id, { url, size, ext });
  }
  return [...best.values()];
}

const pad = (n) => String(n).padStart(2, "0");
let grand = 0;

for (const slug of slugs) {
  const page = await fetch(`${SITE}/${slug}`, { headers: HEADERS });
  if (!page.ok) {
    console.log(`  ${slug}: page HTTP ${page.status} — ignoree`);
    continue;
  }
  const html = await page.text();

  if (html.includes("js-password-form")) {
    console.log(`  ${slug}: VERROUILLEE, rien a prendre`);
    continue;
  }

  const shots = widestPerImage(html);
  const dir = join(dest, slug);
  await mkdir(dir, { recursive: true });

  let bytes = 0;
  let n = 0;
  for (const [i, s] of shots.entries()) {
    const res = await fetch(s.url, { headers: HEADERS });
    if (!res.ok) {
      console.log(`    ! ${slug}/${pad(i + 1)} HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(join(dir, `${pad(i + 1)}-${s.size}px.${s.ext}`), buf);
    bytes += buf.length;
    n++;
  }
  grand += bytes;
  console.log(
    `  ${slug}: ${n}/${shots.length} images, ${(bytes / 1048576).toFixed(1)} Mo`
  );
}

console.log(`\nTOTAL ${(grand / 1048576).toFixed(1)} Mo dans ${dest}`);
