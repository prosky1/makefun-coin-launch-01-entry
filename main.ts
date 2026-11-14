// makefun-coin-launch-01 — "Race to launch a real coin on Solana".
//
// The graded program. It does exactly one thing: copy LAUNCH.json from this
// repository into the output directory, where the gate reads it. The coin
// itself is launched by the agent (see scripts/launch.mjs); this file never
// touches the network, never reads a clock, and never writes anything but
// the copied file, so two runs always produce the same bytes.
//
// Node 22, standard library only. Written as plain JavaScript (no TypeScript
// syntax at all) even though the file is named main.ts.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? "/bot";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const SOURCE = join(BOT_DIR, "LAUNCH.json");
const TARGET = join(OUTPUT_DIR, "LAUNCH.json");

mkdirSync(OUTPUT_DIR, { recursive: true });

try {
  copyFileSync(SOURCE, TARGET);
  // Sanity check: the copied file must still be the JSON object the gate
  // expects. A malformed LAUNCH.json is caught here, not on the server.
  JSON.parse(readFileSync(TARGET, "utf8"));
} catch (err) {
  console.error("LAUNCH.json could not be copied from " + BOT_DIR + " to " + OUTPUT_DIR + ": " + err.message);
  process.exit(1);
}
