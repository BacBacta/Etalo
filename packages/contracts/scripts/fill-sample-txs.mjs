#!/usr/bin/env node
/**
 * fill-sample-txs.mjs — fill `docs/audit/SAMPLE_TXS.md` mechanically
 * from `docs/audit/smoke-e2e-tx-output.json` produced by the J11.5
 * Block 8 smoke E2E orchestrator.
 *
 * Why a mechanical fill : the markdown table has 10+ TBD rows that
 * each need 3 cells updated (Status / Sample tx / Block). Hand-
 * editing is error-prone (mis-aligned rows, broken links) and the
 * exercise repeats for every V1.5+ mainnet redeploy + smoke run.
 * This script is idempotent : running it twice produces the same
 * output, so a partial smoke run + later re-fill is safe.
 *
 * Match key : the table's "Smoke step" column (e.g. "J11.5 §A.1")
 * is matched against the JSON's `smokeStep` field (e.g. "§A.1") via
 * substring of the §X.Y token. The match is anchored to the column
 * position so a stray "§A.1" elsewhere doesn't false-positive.
 *
 * Usage :
 *   node packages/contracts/scripts/fill-sample-txs.mjs
 *
 * Flags :
 *   --dry         : print the diff to stdout, do not write the file
 *   --json <path> : override the input JSON path
 *   --md <path>   : override the markdown target path
 *
 * Output :
 *   - SAMPLE_TXS.md updated in place (a `.bak` is written first)
 *   - Summary printed : N rows filled / N rows already-✓ / N rows
 *     unmatched (e.g. Time-bound / Operational entries that have
 *     no JSON counterpart by design)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");

function pickArg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const JSON_PATH = pickArg(
  "--json",
  path.join(REPO_ROOT, "docs", "audit", "smoke-e2e-tx-output.json"),
);
const MD_PATH = pickArg(
  "--md",
  path.join(REPO_ROOT, "docs", "audit", "SAMPLE_TXS.md"),
);

// ============================================================
// Load + validate
// ============================================================
if (!fs.existsSync(JSON_PATH)) {
  console.error(`[fatal] JSON output not found at ${JSON_PATH}`);
  console.error(
    `Run \`pnpm hardhat run scripts/smoke-e2e-j11-5.ts --network celoSepolia\` first.`,
  );
  process.exit(1);
}
if (!fs.existsSync(MD_PATH)) {
  console.error(`[fatal] SAMPLE_TXS.md not found at ${MD_PATH}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
if (!summary.txs || typeof summary.txs !== "object") {
  console.error(`[fatal] smoke-e2e-tx-output.json missing \`txs\` map`);
  process.exit(1);
}
const explorerBase = summary.explorerBase ?? "https://celo-sepolia.blockscout.com";
const txs = summary.txs;

// Build a lookup keyed by smokeStep substring (e.g. "§A.1").
const bySmokeStep = new Map();
for (const [, rec] of Object.entries(txs)) {
  if (!rec.smokeStep || !rec.hash) continue;
  bySmokeStep.set(rec.smokeStep, rec);
}

console.log(
  `Loaded ${bySmokeStep.size} tx records from ${path.relative(REPO_ROOT, JSON_PATH)}`,
);

// ============================================================
// Row matcher
//
// We use a regex to find rows of the form (whitespace-tolerant) :
//   | `methodName` | Contract | ⏳ TBD | — | — | J11.5 §A.1 | Notes |
// and capture exactly the 3 cells we need to replace (status / sample
// tx / block) plus the smokeStep token. This keeps the row pipes,
// padding, and Notes column verbatim — much safer than split/join.
// ============================================================
const ROW_RE = /^(\|[^|\n]+\|[^|\n]+\|\s*)⏳ TBD(\s*\|\s*)—(\s*\|\s*)—(\s*\|[^|\n]*?)(§[A-Z]\.?\d+[a-z]?)([^|\n]*\|[^|\n]*\|)\s*$/;

const md = fs.readFileSync(MD_PATH, "utf8");
const lines = md.split(/\r?\n/);

let filled = 0;
let alreadyDone = 0;
let pendingNoMatch = 0;
const skippedDeferred = [];
const unmatchedJson = new Set(bySmokeStep.keys());

const newLines = lines.map((line) => {
  if (!line.startsWith("|")) return line;
  // Recognize and tally already-filled / explicitly-deferred rows.
  if (line.includes(" ✓ |")) {
    alreadyDone += 1;
    return line;
  }
  if (line.includes("⏳ Time-bound") || line.includes("🔒 Operational") || line.includes("🔒 V2-deferred")) {
    skippedDeferred.push(line.match(/`([^`]+)`/)?.[1] ?? "(unknown method)");
    return line;
  }

  const m = line.match(ROW_RE);
  if (!m) return line;
  const [, prefix, sep1, sep2, smokeStepHead, stepKey, smokeStepTail] = m;
  const rec = bySmokeStep.get(stepKey);
  if (!rec) {
    pendingNoMatch += 1;
    return line;
  }
  unmatchedJson.delete(stepKey);

  const shortHash = `${rec.hash.slice(0, 10)}…`;
  const url = rec.explorerUrl ?? `${explorerBase}/tx/${rec.hash}`;
  const sampleTxCell = `[\`${shortHash}\`](${url})`;
  const blockCell = rec.block ?? "—";

  filled += 1;
  return `${prefix}✓${sep1}${sampleTxCell}${sep2}${blockCell}${smokeStepHead}${stepKey}${smokeStepTail}`;
});

// ============================================================
// Diff + write
// ============================================================
const newMd = newLines.join("\n");
const changed = newMd !== md;

console.log(`\n=== Fill summary ===`);
console.log(`Rows filled         : ${filled}`);
console.log(`Already-✓ rows      : ${alreadyDone}`);
console.log(`Deferred (skipped)  : ${skippedDeferred.length}`);
if (skippedDeferred.length > 0) {
  for (const m of skippedDeferred) console.log(`  - ${m}`);
}
console.log(`TBD rows w/o JSON   : ${pendingNoMatch}  (left as-is)`);
if (unmatchedJson.size > 0) {
  console.log(
    `\n[warn] ${unmatchedJson.size} JSON tx record(s) had no matching ⏳ TBD row :`,
  );
  for (const k of unmatchedJson) {
    console.log(`  - ${k}  (hash=${bySmokeStep.get(k).hash})`);
  }
  console.log(
    `This may be expected if the smoke script captured setup tx that aren't tracked in SAMPLE_TXS.md.`,
  );
}

if (DRY_RUN) {
  console.log(`\n[dry-run] No file written. Would change : ${changed ? "yes" : "no"}.`);
  process.exit(0);
}

if (!changed) {
  console.log(`\nSAMPLE_TXS.md already up to date — no write.`);
  process.exit(0);
}

const bakPath = `${MD_PATH}.bak`;
fs.copyFileSync(MD_PATH, bakPath);
fs.writeFileSync(MD_PATH, newMd);
console.log(
  `\nSAMPLE_TXS.md updated. Backup at ${path.relative(REPO_ROOT, bakPath)}.`,
);
console.log(`Review the diff via : git diff ${path.relative(REPO_ROOT, MD_PATH)}`);
