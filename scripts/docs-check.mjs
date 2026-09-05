#!/usr/bin/env node
// Compare docs/setup — the plan of record — against the repo it describes.
//
// The plan is executable: every file is a `cat > … <<'EOF'` heredoc and every script a
// `pnpm pkg set`. That makes drift mechanically checkable, which matters because it is
// invisible by eye: a doc block that is not prettier-formatted gets rewritten by
// `pnpm format` on first contact and silently disagrees from then on.
//
// Three checks, matching the three ways the plan configures a package:
//   1. file contents vs the file on disk         (composed — see below)
//   2. `pnpm pkg set scripts.x=…` vs package.json
//   3. `pnpm pkg set field=…` / `pnpm pkg delete field` vs package.json
//
// A path's expected contents are COMPOSED, not taken from a single block. The last
// `cat >` heredoc is the base, and every ```diff hunk after it is applied in slice order;
// the result is what disk must equal. That exists because the alternative rots: when a
// later slice only *adds* to a shared file, writing it whole means copying someone else's
// heredoc, and only the last copy was ever compared — so amending the upstream slice left
// every copy above it silently wrong. A slice that adds three catalog entries now says so
// in three lines, and a hunk that stops applying is a hard error naming the file, which is
// the upstream amendment announcing itself.
//
// Package context comes from following `cd` through the plan, in line order: a trailing
// `cd ../..` must not be applied to heredocs written earlier in the same block. The plan
// is one file per slice and a slice does not always `cd` back to the root before it ends,
// so the slice files are read in filename order — which is what the numeric prefixes are
// for. Nothing but slice files lives here, so that order is total and the `cwd` it threads
// is the plan's own: any other .md dropped into this directory joins the chain at its
// filename's position, and one carrying a `cd` would silently move every slice after it.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/setup";
const slices = readdirSync(join(REPO, DOC))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => [f, readFileSync(join(REPO, DOC, f), "utf8")]);

const DELETED = Symbol("deleted");
const ops = new Map(); // repo-relative path -> [{ slice, body } | { slice, hunks }]
const scripts = new Map(); // package dir -> Map(script -> command)
const fields = new Map(); // package dir -> Map(field -> value | DELETED)

const put = (m, pkg, k, v) => {
  if (!m.has(pkg)) m.set(pkg, new Map());
  m.get(pkg).set(k, v);
};

/** Resolve a `cd` target. The doc does not always return to the root between slices, so
 *  a target naming a top-level workspace directory is treated as repo-relative. */
function resolveCd(base, target) {
  if (target.startsWith("apps/") || target.startsWith("packages/"))
    return target;
  if (target === "../..") return "";
  if (target.startsWith("../../")) return target.slice("../../".length);
  const r = normalize(base ? join(base, target) : target);
  return r === "." ? "" : r;
}

const op = (rel, o) => {
  if (!ops.has(rel)) ops.set(rel, []);
  ops.get(rel).push(o);
};

/** Split a ```diff body into hunks. `@@` lines separate them and carry nothing the
 *  checker needs — the anchor is the context, not a line number the doc would have to
 *  keep true. A line that is neither + nor - is context, with one leading space stripped
 *  if present: prettier trims trailing whitespace in markdown, so a blank context line
 *  reaches us as "" rather than " ". */
function hunksOf(body) {
  // The newline before the closing fence splits into a trailing "", which would become an
  // empty context line the base has no reason to carry — every hunk would fail to anchor.
  if (body.at(-1) === "") body = body.slice(0, -1);

  const out = [[]];
  for (const line of body) {
    if (/^@@/.test(line)) out.push([]);
    else if (line !== "\\ No newline at end of file") out.at(-1).push(line);
  }
  return out.filter((h) => h.some((l) => l.trim()));
}

let cwd = "";
// The fence length is captured and back-referenced so a longer fence can contain a
// shorter one. This file is itself embedded in the doc and contains a fence in the
// regex above, so its block is written with four backticks; matching greedily on
// three would truncate it silently — which is exactly the drift this tool exists to
// catch, and did catch, on itself.
//
// `cd` state carries across slice files, so the slices are walked in filename order and
// share one `cwd`. A ```diff header names a repo-relative path and is deliberately not
// cwd-sensitive: a delta is read where the change is explained, which is not always where
// the shell happens to be standing.
for (const [slice, text] of slices) {
  for (const [, , lang, block] of text.matchAll(
    /(`{3,})(bash|diff)\n([\s\S]*?)\1/g,
  )) {
    const lines = block.split("\n");

    if (lang === "diff") {
      const head = lines[0]?.match(/^--- (\S+)$/);
      if (!head) continue; // an illustrative diff, not a claim about a file
      op(normalize(head[1]), { slice, hunks: hunksOf(lines.slice(1)) });
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hd = line.trim().match(/^cat > (\S+) <<'EOF'$/);
      if (hd) {
        const body = [];
        i++;
        while (i < lines.length && lines[i] !== "EOF") body.push(lines[i++]);
        op(normalize(join(cwd, hd[1])), { slice, body: body.join("\n") });
        continue;
      }
      if (line.trim().startsWith("#")) continue;

      const cd = line.match(/(?:mkdir -p \S+ && )?\bcd (\S+)/);
      if (cd) cwd = resolveCd(cwd, cd[1]);

      for (const m of line.matchAll(/scripts\.([A-Za-z0-9_-]+)="([^"]*)"/g))
        put(scripts, cwd, m[1], m[2]);
      for (const m of line.matchAll(/'scripts\["([^"]+)"\]=([^']*)'/g))
        put(scripts, cwd, m[1], m[2]);
      for (const m of line.matchAll(
        /pnpm pkg set ([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/g,
      ))
        if (m[1] !== "scripts") put(fields, cwd, m[1], m[2]);
      for (const m of line.matchAll(
        /pnpm pkg delete ([A-Za-z][A-Za-z0-9_.-]*)/g,
      ))
        if (!m[1].includes(".")) put(fields, cwd, m[1], DELETED);
    }
  }
}

// Baseline of known-expected mismatches (see docs-check.ignore for why they exist).
const ignorePath = join(REPO, "scripts/docs-check.ignore");
const ignored = new Map(); // key -> reason
if (existsSync(ignorePath)) {
  for (const line of readFileSync(ignorePath, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const [key, ...rest] = s.split(/\s+#\s*/);
    ignored.set(key.trim(), rest.join(" ") || "no reason given");
  }
}
const usedIgnores = new Set();
/** Route a mismatch to the baseline when it is listed there. */
const report = (key, message) => {
  if (ignored.has(key)) usedIgnores.add(key);
  else drift.push(message);
};

const drift = [];
const pending = [];
// A doc value built by shell substitution cannot be compared literally.
const literal = (v) => typeof v === "string" && !v.includes("$(");
const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Apply one hunk to `lines`, anchored on its context rather than a line number.
 *
 *  The match must be unique. An ambiguous hunk is not a near miss to be resolved by
 *  picking the first occurrence — it means the context does not identify the place, and
 *  guessing would let the doc claim a change it did not describe. */
function applyHunk(lines, hunk) {
  const before = [];
  const after = [];
  for (const l of hunk) {
    if (l.startsWith("+")) after.push(l.slice(1));
    else if (l.startsWith("-")) before.push(l.slice(1));
    else {
      const c = l.startsWith(" ") ? l.slice(1) : l;
      before.push(c);
      after.push(c);
    }
  }
  if (!before.length)
    return { error: "hunk has no context or removed lines to anchor on" };

  const at = [];
  for (let i = 0; i + before.length <= lines.length; i++)
    if (before.every((l, j) => lines[i + j] === l)) at.push(i);

  if (at.length === 0) {
    // Name the line the hunk stopped agreeing on, not its first line. The longest prefix
    // that still matches somewhere points at what the upstream slice changed; reporting
    // `before[0]` instead sends you to a line that is usually still correct.
    let best = 0;
    for (let n = 1; n <= before.length; n++) {
      const head = before.slice(0, n);
      const found = lines.some((_, i) =>
        head.every((l, j) => lines[i + j] === l),
      );
      if (!found) break;
      best = n;
    }
    return {
      error: `hunk does not apply — the doc expects this line and the base no longer has it:\n      ${before[best]}`,
    };
  }
  if (at.length > 1)
    return { error: `hunk is ambiguous — context matches ${at.length} places` };

  return {
    lines: [
      ...lines.slice(0, at[0]),
      ...after,
      ...lines.slice(at[0] + before.length),
    ],
  };
}

/** The doc's expected contents for a path: the last whole-file heredoc, plus every
 *  delta written after it, in slice order. */
function compose(rel, list) {
  const base = list.findLastIndex((o) => o.body !== undefined);
  if (base === -1) {
    drift.push(
      `${rel} — a ${list[0].slice} delta with no heredoc to apply it to`,
    );
    return null;
  }
  let lines = list[base].body.split("\n");
  for (const o of list.slice(base + 1)) {
    for (const hunk of o.hunks) {
      const r = applyHunk(lines, hunk);
      if (r.error) {
        // Never baselined. This is the doc disagreeing with itself, which no build
        // state excuses — and it is what an amended upstream slice looks like.
        drift.push(`${rel} — ${o.slice}: ${r.error}`);
        return null;
      }
      lines = r.lines;
    }
  }
  return lines.join("\n");
}

for (const [rel, list] of [...ops].sort(byKey)) {
  const want = compose(rel, list);
  if (want === null) continue;
  const f = join(REPO, rel);
  if (!existsSync(f)) {
    // Absent AND baselined is the baseline doing its job, not a stale entry. Two of the
    // permanent entries name gitignored files, so a fresh clone has neither — and a
    // missing file never reached report(), which left those entries looking unused and
    // failed the check on every clone before the first `pnpm dev`. Only an unbaselined
    // path is genuinely "not built yet".
    if (ignored.has(rel)) usedIgnores.add(rel);
    else pending.push(`${rel} — not built yet`);
  } else if (
    readFileSync(f, "utf8").replace(/\n+$/, "") !== want.replace(/\n+$/, "")
  ) {
    report(rel, `${rel} — contents differ from the doc`);
  }
}

const pkgJson = (pkg) => {
  const f = join(REPO, pkg, "package.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};

for (const [pkg, want] of [...scripts].sort(byKey)) {
  const pj = pkgJson(pkg);
  if (!pj) continue;
  const have = pj.scripts ?? {};
  for (const [name, cmd] of [...want].sort(byKey)) {
    if (!literal(cmd)) continue;
    if (!(name in have))
      pending.push(`${pkg || "(root)"}: script \`${name}\` — not added yet`);
    else if (have[name] !== cmd)
      report(
        `${pkg}:${name}`,
        `${pkg || "(root)"}: script \`${name}\`\n    doc:  ${cmd}\n    repo: ${have[name]}`,
      );
  }
}

for (const [pkg, want] of [...fields].sort(byKey)) {
  const pj = pkgJson(pkg);
  if (!pj) continue;
  for (const [name, val] of [...want].sort(byKey)) {
    if (val === DELETED) {
      if (name in pj)
        drift.push(
          `${pkg || "(root)"}: \`${name}\` should be deleted, still ${JSON.stringify(pj[name])}`,
        );
    } else if (!literal(val)) {
      continue;
    } else if (!(name in pj)) {
      drift.push(
        `${pkg || "(root)"}: \`${name}\` missing — doc sets it to ${JSON.stringify(val)}`,
      );
    } else if (pj[name] !== val) {
      drift.push(
        `${pkg || "(root)"}: \`${name}\`\n    doc:  ${JSON.stringify(val)}\n    repo: ${JSON.stringify(pj[name])}`,
      );
    }
  }
}

if (pending.length) {
  console.log(
    `Not built yet (${pending.length}) — expected while the scaffold is in progress:`,
  );
  for (const p of pending) console.log(`  · ${p}`);
  console.log("");
}
if (usedIgnores.size) {
  console.log(
    `Baselined (${usedIgnores.size}) — see scripts/docs-check.ignore:`,
  );
  for (const k of usedIgnores) console.log(`  · ${k} — ${ignored.get(k)}`);
  console.log("");
}
// Drift prints before the stale-baseline report and neither returns early: a run that
// exits on a stale entry hides the real failure underneath it, which is the wrong way
// round — a stale line is bookkeeping, drift is the thing the tool is for.
if (drift.length) {
  console.error(`Drift between ${DOC} and the repo (${drift.length}):`);
  for (const d of drift) console.error(`  ✗ ${d}`);
  console.error(
    `\nFix whichever is wrong — the doc is the plan of record, but prettier owns formatting.`,
  );
}
const stale = [...ignored.keys()].filter((k) => !usedIgnores.has(k));
if (stale.length) {
  console.error(
    `\nStale entries in scripts/docs-check.ignore (${stale.length}) — these no longer`,
  );
  console.error(`mismatch, so the baseline is hiding nothing. Delete them:`);
  for (const s of stale) console.error(`  ✗ ${s}`);
}
if (drift.length || stale.length) process.exit(1);
const deltas = [...ops.values()].reduce(
  (n, l) => n + l.filter((o) => o.hunks).length,
  0,
);
console.log(
  `No drift: ${ops.size} files (${deltas} composed from deltas) and ${[...scripts.values()].reduce((n, m) => n + m.size, 0)} scripts match ${DOC}.`,
);
