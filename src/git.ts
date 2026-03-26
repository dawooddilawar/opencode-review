import { spawnSync } from "node:child_process";

export type GetDiffOptions = {
  cwd: string;
  baseBranch: string;
  localOnly?: boolean;
};

export type DiffMode = "local" | "branch" | "combined" | "none";

export type DiffResult = {
  diff: string;
  mode: DiffMode;
};

export type GitExec = (cwd: string, args: string[]) => { stdout: string; ok: boolean };

const FULL_CONTEXT = "-U99999";

const MAX_UNTRACKED_FILE_BYTES = 100_000;

const defaultExec: GitExec = (cwd, args) => {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return { stdout: res.stdout ?? "", ok: res.status === 0 };
};

export function isGitRepo(cwd: string, exec: GitExec = defaultExec): boolean {
  const res = exec(cwd, ["rev-parse", "--git-dir"]);
  return res.ok && res.stdout.trim().length > 0;
}

export function hasLocalChanges(cwd: string, exec: GitExec = defaultExec): boolean {
  const res = exec(cwd, ["status", "--porcelain"]);
  return res.ok && res.stdout.trim().length > 0;
}

function getUntrackedFiles(cwd: string, exec: GitExec): string[] {
  const res = exec(cwd, ["ls-files", "--others", "--exclude-standard"]);
  if (!res.ok || !res.stdout.trim()) return [];
  return res.stdout.trim().split("\n").filter(Boolean);
}

function isLikelyBinary(path: string): boolean {
  const binaryExtensions = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".tif",
    ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov", ".flv",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".sqlite", ".db",
  ]);
  const dotIdx = path.lastIndexOf(".");
  const ext = dotIdx >= 0 ? path.slice(dotIdx).toLowerCase() : "";
  return binaryExtensions.has(ext);
}

function buildUntrackedDiff(cwd: string, files: string[], exec: GitExec): string {
  const parts: string[] = [];
  for (const file of files) {
    if (isLikelyBinary(file)) continue;

    const result = exec(cwd, ["diff", "--no-index", FULL_CONTEXT, "--", "/dev/null", file]);
    // git diff --no-index exits with 1 when there are differences, which is expected
    if (result.stdout.trim().length > 0 && result.stdout.length <= MAX_UNTRACKED_FILE_BYTES) {
      parts.push(result.stdout);
    }
  }
  return parts.join("\n");
}

function getLocalDiff(cwd: string, exec: GitExec): string {
  const parts: string[] = [];

  const staged = exec(cwd, ["diff", "--staged", FULL_CONTEXT]);
  if (staged.ok && staged.stdout.trim()) {
    parts.push(staged.stdout);
  }

  const unstaged = exec(cwd, ["diff", FULL_CONTEXT]);
  if (unstaged.ok && unstaged.stdout.trim()) {
    parts.push(unstaged.stdout);
  }

  const untrackedFiles = getUntrackedFiles(cwd, exec);
  if (untrackedFiles.length > 0) {
    const untrackedDiff = buildUntrackedDiff(cwd, untrackedFiles, exec);
    if (untrackedDiff.trim()) {
      parts.push(untrackedDiff);
    }
  }

  return parts.join("\n");
}

function getBranchDiff(cwd: string, baseBranch: string, exec: GitExec): string {
  const res = exec(cwd, ["diff", `${baseBranch}...HEAD`, FULL_CONTEXT]);
  if (res.ok && res.stdout.trim().length > 0) return res.stdout;
  return "";
}

export type FileDiffStat = {
  file: string;
  additions: number;
  deletions: number;
};

export function parseDiffStats(diff: string): FileDiffStat[] {
  const stats: FileDiffStat[] = [];
  let current: FileDiffStat | null = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ") || line.startsWith("diff --no-index ")) {
      if (current) stats.push(current);
      const match = line.match(/ b\/(.+)$/);
      current = { file: match ? match[1] : "(unknown)", additions: 0, deletions: 0 };
    } else if (current) {
      if (line.startsWith("+") && !line.startsWith("+++")) current.additions++;
      else if (line.startsWith("-") && !line.startsWith("---")) current.deletions++;
    }
  }
  if (current) stats.push(current);

  return stats;
}

export function getDiff(opts: GetDiffOptions, exec: GitExec = defaultExec): DiffResult {
  if (!isGitRepo(opts.cwd, exec)) throw new Error("Not in a git repository");

  if (opts.localOnly) {
    if (hasLocalChanges(opts.cwd, exec)) {
      const diff = getLocalDiff(opts.cwd, exec);
      if (diff.trim()) return { diff, mode: "local" };
    }
    return { diff: "", mode: "none" };
  }

  const branchDiff = getBranchDiff(opts.cwd, opts.baseBranch, exec);
  const hasLocal = hasLocalChanges(opts.cwd, exec);
  const localDiff = hasLocal ? getLocalDiff(opts.cwd, exec) : "";

  const hasBranch = branchDiff.trim().length > 0;
  const hasLocalDiff = localDiff.trim().length > 0;

  if (hasBranch && hasLocalDiff) {
    return { diff: `${branchDiff}\n${localDiff}`, mode: "combined" };
  }
  if (hasBranch) {
    return { diff: branchDiff, mode: "branch" };
  }
  if (hasLocalDiff) {
    return { diff: localDiff, mode: "local" };
  }

  return { diff: "", mode: "none" };
}
