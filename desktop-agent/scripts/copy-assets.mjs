// tsc only compiles .ts files — the wizard's static HTML never gets
// copied into dist/ on its own. This runs as `postbuild` so `npm start`
// (which only ever reads from dist/) always finds it.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "wizard", "public");
const dest = path.join(root, "dist", "wizard", "public");

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied wizard assets: ${src} -> ${dest}`);
