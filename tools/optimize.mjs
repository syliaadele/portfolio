/* ---------------------------------------------------------------
   Recompresses the harvested sources to WebP.

   Quality 85 was chosen by measurement, not by habit: against these
   particular sources the PSNR plateaus — q90 buys 1 dB for 65% more
   bytes. The reason is that the originals are already Adobe's JPEGs, so
   the extra bits go into reproducing existing compression artefacts
   rather than recovering detail. 85 leaves a margin on flat areas, where
   WebP is most likely to band, at about -80% on weight.

   Two sizes per image: the full one for project pages, and a small one
   for the hover preview, matching the -sm convention already in test2.

   Animated GIFs are skipped on purpose. sharp would keep only their
   first frame, and how they should behave belongs to the design of the
   drawings section, not to a batch job.
   --------------------------------------------------------------- */

import sharp from "sharp";
import { readdir, mkdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const FULL = 1800; // px, for a column of 700-900 on a 2x display
const SMALL = 700; // px, for previews and covers
const QUALITY = 85;

const JOBS = [
  { from: "_source/work", to: "test2/media/work" },
  { from: "_source/dessins", to: "test2/media/dessins" },
  /* Stays inside _private, which is gitignored: these are the files that
     will be encrypted, and an unencrypted copy in the repo would undo the
     point of encrypting them at all. */
  { from: "_private", to: "_private/_optimized" },
];

const skipped = [];
let inBytes = 0;
let outBytes = 0;
let count = 0;

async function convertDir(from, to) {
  let entries;
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    const src = join(from, e.name);

    if (e.isDirectory()) {
      /* never descend into our own output */
      if (e.name === "_optimized") continue;
      await convertDir(src, join(to, e.name));
      continue;
    }

    const ext = extname(e.name).toLowerCase();
    if (ext === ".gif") {
      skipped.push(src);
      continue;
    }
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;

    await mkdir(to, { recursive: true });

    /* drop the "-1920px" the harvester appended: the size is no longer
       what it was on Adobe's CDN */
    const stem = basename(e.name, ext).replace(/-\d+px$/, "");

    const full = await sharp(src)
      .resize({ width: FULL, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(join(to, `${stem}.webp`));

    const small = await sharp(src)
      .resize({ width: SMALL, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(join(to, `${stem}-sm.webp`));

    inBytes += (await stat(src)).size;
    outBytes += full.size + small.size;
    count++;
  }
}

for (const j of JOBS) {
  const before = outBytes;
  await convertDir(j.from, j.to);
  console.log(`  ${j.from} -> ${j.to}  (+${((outBytes - before) / 1048576).toFixed(1)} Mo)`);
}

console.log(
  `\n${count} images : ${(inBytes / 1048576).toFixed(0)} Mo -> ${(outBytes / 1048576).toFixed(1)} Mo` +
    `  (-${(100 - (outBytes / inBytes) * 100).toFixed(0)}%, deux tailles comprises)`
);

if (skipped.length) {
  console.log(`\n${skipped.length} GIF laisses de cote :`);
  skipped.forEach((s) => console.log("  " + s));
}
