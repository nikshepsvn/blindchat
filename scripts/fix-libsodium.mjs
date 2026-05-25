#!/usr/bin/env node
// Workaround for an upstream packaging bug in libsodium-wrappers-sumo:
// its ESM build imports './libsodium-sumo.mjs' but that file actually
// lives in the sibling `libsodium-sumo` package. With pnpm + ESM strict
// resolution Node can't find it, so we symlink it into place.
//
// pnpm stores deps under node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...
// so we walk .pnpm to find both packages regardless of version pinning.
import { existsSync, readdirSync, symlinkSync, lstatSync } from "node:fs";
import { join, dirname, relative, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = pathResolve(__dirname, "..");
const pnpmRoot = join(root, "node_modules", ".pnpm");

if (!existsSync(pnpmRoot)) {
  console.log("[fix-libsodium] no node_modules/.pnpm — skipping");
  process.exit(0);
}

const entries = readdirSync(pnpmRoot);
const wrapperDirs = entries.filter((e) => e.startsWith("libsodium-wrappers-sumo@"));
const sumoDirs = entries.filter((e) => e.startsWith("libsodium-sumo@"));

if (wrapperDirs.length === 0 || sumoDirs.length === 0) {
  console.log("[fix-libsodium] libsodium packages not found — skipping");
  process.exit(0);
}

for (const wrapperEntry of wrapperDirs) {
  const wrapperEsm = join(
    pnpmRoot,
    wrapperEntry,
    "node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm"
  );
  const target = join(wrapperEsm, "libsodium-sumo.mjs");

  if (!existsSync(wrapperEsm)) continue;
  if (symlinkExists(target) || existsSync(target)) continue;

  const sumoSrc = join(
    pnpmRoot,
    sumoDirs[0],
    "node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs"
  );
  if (!existsSync(sumoSrc)) {
    console.warn("[fix-libsodium] sumo source missing:", sumoSrc);
    continue;
  }

  try {
    const relSrc = relative(dirname(target), sumoSrc);
    symlinkSync(relSrc, target);
    console.log("[fix-libsodium] linked", target, "→", relSrc);
  } catch (err) {
    console.warn("[fix-libsodium] symlink failed:", err?.message ?? err);
  }
}

function symlinkExists(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
