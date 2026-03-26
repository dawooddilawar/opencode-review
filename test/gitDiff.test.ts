import test from "node:test";
import assert from "node:assert/strict";

import { getDiff, hasLocalChanges, isGitRepo, parseDiffStats, type GitExec } from "../src/git";

function makeExec(handlers: Record<string, { ok: boolean; stdout: string }>): { exec: GitExec; calls: string[] } {
  const calls: string[] = [];
  const exec: GitExec = (_cwd: string, args: string[]) => {
    const key = args.join(" ");
    calls.push(key);
    if (handlers[key]) return handlers[key];
    for (const [pattern, result] of Object.entries(handlers)) {
      if (key.startsWith(pattern)) return result;
    }
    return { ok: false, stdout: "" };
  };
  return { exec, calls };
}

const GIT_DIR = { ok: true, stdout: ".git\n" };
const EMPTY = { ok: true, stdout: "" };
const FAIL = { ok: false, stdout: "" };

// ─── isGitRepo ───────────────────────────────────────────────

test("isGitRepo: returns true for a git repository", () => {
  const { exec } = makeExec({ "rev-parse --git-dir": GIT_DIR });
  assert.equal(isGitRepo("/repo", exec), true);
});

test("isGitRepo: returns false when not a git repo", () => {
  const { exec } = makeExec({ "rev-parse --git-dir": FAIL });
  assert.equal(isGitRepo("/not-repo", exec), false);
});

// ─── hasLocalChanges ─────────────────────────────────────────

test("hasLocalChanges: detects changes via git status --porcelain", () => {
  const { exec } = makeExec({
    "status --porcelain": { ok: true, stdout: "M  src/foo.ts\n?? newfile.ts\n" },
  });
  assert.equal(hasLocalChanges("/repo", exec), true);
});

test("hasLocalChanges: returns false when working tree is clean", () => {
  const { exec } = makeExec({
    "status --porcelain": EMPTY,
  });
  assert.equal(hasLocalChanges("/repo", exec), false);
});

// ─── getDiff: default mode — combines branch and local ───────

test("getDiff: combined mode when both branch and local changes exist", () => {
  const { exec, calls } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  local.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff --git a/local.ts b/local.ts\n+local change\n" },
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": { ok: true, stdout: "diff --git a/feature.ts b/feature.ts\n+branch change\n" },
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "combined");
  assert.match(result.diff, /\+branch change/);
  assert.match(result.diff, /\+local change/);
  assert.ok(calls.includes("diff develop...HEAD -U99999"), "should fetch branch diff");
});

test("getDiff: local mode when only local changes exist (no branch diff)", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  staged.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff --git a/staged.ts b/staged.ts\n+staged content\n" },
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "local");
  assert.match(result.diff, /\+staged content/);
});

test("getDiff: local mode with unstaged changes only (no branch diff)", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: " M unstaged.ts\n" },
    "diff --staged -U99999": EMPTY,
    "diff -U99999": { ok: true, stdout: "diff --git a/unstaged.ts b/unstaged.ts\n+unstaged content\n" },
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "local");
  assert.match(result.diff, /\+unstaged content/);
});

test("getDiff: local mode combines staged and unstaged changes (no branch diff)", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  staged.ts\n M unstaged.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff --git a/staged.ts b/staged.ts\n+staged\n" },
    "diff -U99999": { ok: true, stdout: "diff --git a/unstaged.ts b/unstaged.ts\n+unstaged\n" },
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "local");
  assert.match(result.diff, /\+staged/);
  assert.match(result.diff, /\+unstaged/);
});

test("getDiff: local mode includes untracked files (no branch diff)", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "?? newfile.ts\n" },
    "diff --staged -U99999": EMPTY,
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": { ok: true, stdout: "newfile.ts\n" },
    "diff --no-index -U99999 -- /dev/null newfile.ts": { ok: false, stdout: "diff --git a/dev/null b/newfile.ts\n+new file content\n" },
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "local");
  assert.match(result.diff, /\+new file content/);
});

test("getDiff: skips binary untracked files", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "?? image.png\n" },
    "diff --staged -U99999": EMPTY,
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": { ok: true, stdout: "image.png\n" },
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "none");
  assert.equal(result.diff, "");
});

test("getDiff: combined mode with staged, unstaged, untracked, and branch changes", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  staged.ts\n M unstaged.ts\n?? brand-new.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff staged\n+staged\n" },
    "diff -U99999": { ok: true, stdout: "diff unstaged\n+unstaged\n" },
    "ls-files --others --exclude-standard": { ok: true, stdout: "brand-new.ts\n" },
    "diff --no-index -U99999 -- /dev/null brand-new.ts": { ok: false, stdout: "diff untracked\n+brand-new\n" },
    "diff develop...HEAD -U99999": { ok: true, stdout: "diff --git a/feature.ts b/feature.ts\n+branch change\n" },
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "combined");
  assert.match(result.diff, /\+branch change/);
  assert.match(result.diff, /\+staged/);
  assert.match(result.diff, /\+unstaged/);
  assert.match(result.diff, /\+brand-new/);
});

// ─── getDiff: branch mode — three-dot diff ───────────────────

test("getDiff: branch mode when no local changes", () => {
  const { exec, calls } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": EMPTY,
    "diff develop...HEAD -U99999": { ok: true, stdout: "diff --git a/feature.ts b/feature.ts\n+branch change\n" },
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "branch");
  assert.match(result.diff, /\+branch change/);
  assert.ok(calls.includes("diff develop...HEAD -U99999"));
  assert.ok(!calls.some((c) => c.includes("develop..HEAD")), "should NOT use two-dot diff");
});

// ─── getDiff: no changes at all ──────────────────────────────

test("getDiff: returns mode 'none' when no local or branch changes", () => {
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": EMPTY,
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "none");
  assert.equal(result.diff, "");
});

// ─── getDiff: --local-only flag ──────────────────────────────

test("getDiff: localOnly returns only local changes, skips branch diff", () => {
  const { exec, calls } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  local.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff --git a/local.ts b/local.ts\n+local change\n" },
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": { ok: true, stdout: "diff --git a/feature.ts b/feature.ts\n+branch change\n" },
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop", localOnly: true }, exec);
  assert.equal(result.mode, "local");
  assert.match(result.diff, /\+local change/);
  assert.ok(!result.diff.includes("+branch change"), "should not include branch diff");
  assert.ok(!calls.includes("diff develop...HEAD -U99999"), "should not fetch branch diff");
});

test("getDiff: localOnly returns 'none' when no local changes exist", () => {
  const { exec, calls } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": EMPTY,
    "diff develop...HEAD -U99999": { ok: true, stdout: "diff --git a/feature.ts b/feature.ts\n+branch change\n" },
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop", localOnly: true }, exec);
  assert.equal(result.mode, "none");
  assert.equal(result.diff, "");
  assert.ok(!calls.includes("diff develop...HEAD -U99999"), "should not fetch branch diff");
});

// ─── getDiff: throws when not a git repo ─────────────────────

test("getDiff: throws when not in a git repository", () => {
  const { exec } = makeExec({ "rev-parse --git-dir": FAIL });
  assert.throws(() => getDiff({ cwd: "/not-repo", baseBranch: "develop" }, exec), /Not in a git repository/);
});

// ─── getDiff: uses full file context ─────────────────────────

test("getDiff: passes -U99999 for full file context in all diff commands", () => {
  const { exec, calls } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "M  file.ts\n" },
    "diff --staged -U99999": { ok: true, stdout: "diff full context\n+content\n" },
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": EMPTY,
    "diff develop...HEAD -U99999": EMPTY,
  });

  getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  const diffCalls = calls.filter((c) => c.startsWith("diff"));
  for (const call of diffCalls) {
    assert.ok(call.includes("-U99999"), `expected -U99999 in: ${call}`);
  }
});

// ─── getDiff: large untracked files skipped ──────────────────

test("getDiff: skips untracked files larger than 100KB", () => {
  const largeContent = "x".repeat(100_001);
  const { exec } = makeExec({
    "rev-parse --git-dir": GIT_DIR,
    "status --porcelain": { ok: true, stdout: "?? huge.ts\n" },
    "diff --staged -U99999": EMPTY,
    "diff -U99999": EMPTY,
    "ls-files --others --exclude-standard": { ok: true, stdout: "huge.ts\n" },
    "diff --no-index -U99999 -- /dev/null huge.ts": { ok: false, stdout: largeContent },
    "diff develop...HEAD -U99999": EMPTY,
  });

  const result = getDiff({ cwd: "/repo", baseBranch: "develop" }, exec);
  assert.equal(result.mode, "none");
  assert.equal(result.diff, "");
});

// ─── parseDiffStats ──────────────────────────────────────────

test("parseDiffStats: extracts file names and change counts from unified diff", () => {
  const diff = [
    "diff --git a/src/foo.ts b/src/foo.ts",
    "--- a/src/foo.ts",
    "+++ b/src/foo.ts",
    "@@ -1,3 +1,5 @@",
    " const a = 1;",
    "+const b = 2;",
    "+const c = 3;",
    "-const old = 0;",
    " const d = 4;",
    "diff --git a/src/bar.ts b/src/bar.ts",
    "--- a/src/bar.ts",
    "+++ b/src/bar.ts",
    "@@ -10,2 +10,3 @@",
    "+added line",
  ].join("\n");

  const stats = parseDiffStats(diff);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].file, "src/foo.ts");
  assert.equal(stats[0].additions, 2);
  assert.equal(stats[0].deletions, 1);
  assert.equal(stats[1].file, "src/bar.ts");
  assert.equal(stats[1].additions, 1);
  assert.equal(stats[1].deletions, 0);
});

test("parseDiffStats: handles diff --no-index for untracked files", () => {
  const diff = [
    "diff --no-index a/dev/null b/newfile.ts",
    "--- /dev/null",
    "+++ b/newfile.ts",
    "@@ -0,0 +1,3 @@",
    "+line one",
    "+line two",
    "+line three",
  ].join("\n");

  const stats = parseDiffStats(diff);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].file, "newfile.ts");
  assert.equal(stats[0].additions, 3);
  assert.equal(stats[0].deletions, 0);
});

test("parseDiffStats: returns empty array for empty diff", () => {
  assert.deepEqual(parseDiffStats(""), []);
  assert.deepEqual(parseDiffStats("   \n  "), []);
});
