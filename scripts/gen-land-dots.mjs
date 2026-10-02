// Regenerates web/lib/land-dots.json (continent dots for the landing globe) from Natural Earth 110m land.
//   npm i world-atlas topojson-client d3-geo && node scripts/gen-land-dots.mjs web/lib/land-dots.json

import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";
const topo = JSON.parse(readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const land = feature(topo, topo.objects.land);
// Fibonacci lattice over the sphere, keep points on land: even spacing, no pole bunching.
const N = 26000, out = [];
const golden = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const lat = Math.asin(y) * 180 / Math.PI;
  let lon = ((golden * i) * 180 / Math.PI) % 360; if (lon > 180) lon -= 360;
  if (lat < -60) continue; // skip Antarctica, it reads as noise
  if (geoContains(land, [lon, lat])) out.push(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log("land dots:", out.length / 2);
