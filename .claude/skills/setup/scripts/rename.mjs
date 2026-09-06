#!/usr/bin/env node
// Rename the scaffold from its template token to the user's project name.
//
// Usage:
//   node .claude/skills/setup/scripts/rename.mjs <new-name>            # dry run (default)
//   node .claude/skills/setup/scripts/rename.mjs <new-name> --apply    # actually rewrite
//   ... --apply --allow-dirty                                          # skip the clean-tree gate
//
// Why a script and not an instruction: the token appears in ~230 places across ~50 files
// and every one of them is a plain substring swap. Nothing here needs judgment, and doing
// it by hand is how docs/setup gets missed — which breaks `pnpm docs:check`, and with it
// `pnpm verify`, in a way whose cause is several steps removed from the symptom.
//
// No dependencies: node's stdlib plus git, both already required by the workspace.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The literal token this scaffold ships under. It is also the npm scope
// (@cc4-test/db), the Worker name prefix (cc4-test-web) and the Postgres database name,
// which is exactly why one substring replace covers all of them.
const TEMPLATE = "cc4-test";

// Never rewritten by sed-style replacement: the lockfile encodes integrity hashes and
// resolved workspace paths together, and a text edit produces a file that installs but
// no longer matches. `pnpm install` regenerates it correctly instead.
const NEVER_TOUCH = new Set(["pnpm-lock.yaml"]);

// Must be simultaneously a valid npm package/scope name AND a Cloudflare Worker name.
// Worker names are the stricter of the two: lowercase alphanumerics and dashes, no
// leading or trailing dash. 47 chars max total, because the deploy appends "-graphql"
// (8 chars) and Cloudflare's own limit on the resulting name is 63.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,45}[a-z0-9]$/;

const SELF = fileURLToPath(import.meta.url);

function die(message, hint) {
  console.error(`\nrename: ${message}`);
  if (hint) console.error(`        ${hint}`);
  console.error("");
  process.exit(2);
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    // `git grep` exits 1 with empty output when nothing matched — that is a real result,
    // not a failure, and the caller distinguishes the two by the empty string.
    if (error.status === 1 && !error.stderr?.trim()) return "";
    if (error.code === "ENOENT") {
      die("git is not on PATH.", "This script enumerates tracked files with `git grep`; install git and retry.");
    }
    die(`git ${args.join(" ")} failed: ${(error.stderr || error.message).trim()}`);
  }
}

// --- arguments -------------------------------------------------------------

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const allowDirty = argv.includes("--allow-dirty");
const positional = argv.filter((a) => !a.startsWith("--"));

if (positional.length !== 1) {
  die(
    positional.length === 0 ? "no project name given." : `expected one name, got ${positional.length}.`,
    "Usage: node .claude/skills/setup/scripts/rename.mjs <new-name> [--apply] [--allow-dirty]",
  );
}

const name = positional[0];

if (name === TEMPLATE) {
  die(`"${name}" is the template's own name.`, "Pick the name this clone should have instead.");
}
if (!NAME_RE.test(name)) {
  die(
    `"${name}" is not a usable project name.`,
    "Needs 2-47 chars of lowercase letters, digits and dashes, starting and ending alphanumeric. " +
      "No uppercase, no underscores, no dots — it has to work as both an npm scope and a Cloudflare Worker name.",
  );
}

// --- repo state ------------------------------------------------------------

const root = git(["rev-parse", "--show-toplevel"], process.cwd()).trim();
if (!root) die("not inside a git repository.", "Run this from anywhere inside the cloned scaffold.");

const selfRel = relative(root, SELF).split("\\").join("/");

// The rename is a ~50 file rewrite with no undo of its own. A clean tree makes
// `git diff` the review surface and `git checkout .` the undo, so require one.
if (apply && !allowDirty) {
  const dirty = git(["status", "--porcelain"], root).trim();
  if (dirty) {
    die(
      `the working tree has uncommitted changes (${dirty.split("\n").length} path(s)).`,
      "Commit or stash first so `git diff` shows only the rename — or pass --allow-dirty to override.",
    );
  }
}

// -I skips binary files; -l lists paths only; -F treats the token literally. Tracked
// files only, which is the point: node_modules, .env files and build output stay out.
const matched = git(["grep", "-lI", "-F", "--", TEMPLATE], root)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => !NEVER_TOUCH.has(file) && file !== selfRel);

if (matched.length === 0) {
  die(
    `no tracked file contains "${TEMPLATE}".`,
    "This clone has already been renamed, or is not this scaffold. Nothing was changed.",
  );
}

// --- count, split docs/setup out -------------------------------------------

// docs/setup carries more than half the occurrences and is what `pnpm docs:check`
// reconciles against the code. Renaming the repo but not docs/setup leaves docs:check
// reporting dozens of mismatches and `pnpm verify` red, so the split is shown, not buried.
let totalHits = 0;
let docsHits = 0;
const rows = [];

for (const file of matched) {
  const abs = join(root, file);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (error) {
    die(`could not read ${file}: ${error.message}`, "Fix the permission or remove the file, then retry.");
  }
  const hits = text.split(TEMPLATE).length - 1;
  totalHits += hits;
  if (file.startsWith("docs/setup/")) docsHits += hits;
  rows.push({ file, hits, abs, text });
}

rows.sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));

console.log(`\n${TEMPLATE}  ->  ${name}`);
console.log(`${matched.length} tracked files, ${totalHits} occurrences ` + `(${docsHits} in docs/setup, ${totalHits - docsHits} elsewhere)\n`);

const SHOWN = 12; // enough to recognise the shape of the change without paging the terminal
for (const row of rows.slice(0, SHOWN)) {
  console.log(`  ${String(row.hits).padStart(4)}  ${row.file}`);
}
if (rows.length > SHOWN) console.log(`  ${String("+" + (rows.length - SHOWN)).padStart(4)}  more files`);

console.log(`\n  skipped  pnpm-lock.yaml (regenerated by \`pnpm install\`, never text-edited)`);

if (!apply) {
  console.log(`\nDry run — nothing was written. Re-run with --apply to make these changes.\n`);
  process.exit(0);
}

// --- apply -----------------------------------------------------------------

let written = 0;
for (const row of rows) {
  try {
    writeFileSync(row.abs, row.text.split(TEMPLATE).join(name));
    written += 1;
  } catch (error) {
    die(
      `wrote ${written} file(s), then failed on ${row.file}: ${error.message}`,
      "The tree is half-renamed. Run `git checkout .` to revert, fix the cause, and start over.",
    );
  }
}

console.log(`\nRewrote ${written} files.

Next, in order:
  1. pnpm install                 regenerate pnpm-lock.yaml against the new package names
  2. node scripts/docs-check.mjs  must report no drift — a mismatch here means a missed file
  3. git diff                     review, then commit

Not fixed by this rename — they are the template author's accounts, not names:
  apps/graphql/wrangler.jsonc  CORS_ORIGINS / WEB_ORIGIN  (someone else's workers.dev subdomain)
  apps/graphql/wrangler.jsonc  MAIL_TEST_RECIPIENTS       (someone else's inbox)
  apps/graphql/wrangler.jsonc  hyperdrive[0].id           (a deleted binding — deploy fails until reissued)
These are re-issued during cloud provisioning, not renamed.
`);
