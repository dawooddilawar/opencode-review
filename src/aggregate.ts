import type { AggregatedReview, Issue, ReviewStats } from "./types";

export type AggregateOptions = {
  confidenceThreshold: number;
};

function severityRank(sev: unknown): number {
  switch (String(sev ?? "").toUpperCase()) {
    case "HIGH":
      return 0;
    case "MEDIUM":
      return 1;
    case "LOW":
      return 2;
    default:
      return 2;
  }
}

function typeKey(t: unknown): keyof ReviewStats["by_type"] | null {
  switch (String(t ?? "").toUpperCase()) {
    case "CORRECTNESS":
      return "correctness";
    case "DESIGN":
      return "design";
    case "SECURITY":
      return "security";
    case "RELIABILITY":
      return "reliability";
    case "READABILITY":
      return "readability";
    case "TESTS":
      return "tests";
    default:
      return null;
  }
}

/** Normalise a location key so "42" and 42 both match. */
function locationKey(issue: Issue): string | null {
  if (!issue.file) return null;
  const line = issue.line != null ? String(issue.line) : "";
  return `${issue.file}:${line}`;
}

/** Rough title similarity – case-insensitive, trimmed, collapsed whitespace. */
function normaliseTitle(title: unknown): string {
  return String(title ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function isSameIssue(a: Issue, b: Issue): boolean {
  const ta = normaliseTitle(a.title);
  const tb = normaliseTitle(b.title);
  if (!ta || !tb) return false;
  return ta === tb;
}

function pickHigherSeverity(a: Issue, b: Issue): Issue["severity"] {
  return severityRank(a.severity) <= severityRank(b.severity) ? a.severity : b.severity;
}

function pickLonger(a: string | undefined, b: string | undefined): string | undefined {
  return (a ?? "").length >= (b ?? "").length ? a : b;
}

function mergeReviewers(a: Issue, b: Issue): string[] {
  const set = new Set<string>();
  for (const r of a.reviewers ?? []) set.add(r);
  for (const r of b.reviewers ?? []) set.add(r);
  if (a.type) set.add(String(a.type).toLowerCase());
  if (b.type) set.add(String(b.type).toLowerCase());
  return [...set];
}

/**
 * Deduplicate issues that share the same file:line.
 *
 * Merge rules:
 *  - Same location + same issue title → merge into one, credit all reviewers,
 *    keep longer description, use highest severity & confidence.
 *  - Same location + different issue  → keep both, tag as coLocated.
 *  - Same issue + different location  → keep separate (no merge).
 */
export function deduplicateIssues(issues: Issue[]): { deduplicated: Issue[]; removed: number } {
  const locationGroups = new Map<string, Issue[]>();
  const noLocation: Issue[] = [];

  for (const issue of issues) {
    const key = locationKey(issue);
    if (key === null) {
      noLocation.push(issue);
      continue;
    }
    let group = locationGroups.get(key);
    if (!group) {
      group = [];
      locationGroups.set(key, group);
    }
    group.push(issue);
  }

  const result: Issue[] = [];
  let removed = 0;

  for (const group of locationGroups.values()) {
    const merged: Issue[] = [];

    for (const issue of group) {
      let wasMerged = false;

      for (let i = 0; i < merged.length; i++) {
        if (isSameIssue(merged[i]!, issue)) {
          const existing = merged[i]!;
          merged[i] = {
            ...existing,
            severity: pickHigherSeverity(existing, issue),
            confidence: Math.max(existing.confidence ?? 0, issue.confidence ?? 0),
            evidence: pickLonger(existing.evidence, issue.evidence),
            impact: pickLonger(existing.impact, issue.impact),
            recommendation: existing.recommendation && issue.recommendation
              && normaliseTitle(existing.recommendation) !== normaliseTitle(issue.recommendation)
              ? `${existing.recommendation}\n\n[Alternative]: ${issue.recommendation}`
              : pickLonger(existing.recommendation, issue.recommendation),
            reviewers: mergeReviewers(existing, issue),
          };
          wasMerged = true;
          removed++;
          break;
        }
      }

      if (!wasMerged) {
        merged.push({ ...issue });
      }
    }

    if (merged.length > 1) {
      for (const m of merged) m.coLocated = true;
    }

    result.push(...merged);
  }

  result.push(...noLocation);
  return { deduplicated: result, removed };
}

export function computeStats(issues: Issue[], totalCandidates: number, threshold: number, duplicatesRemoved: number): ReviewStats {
  const byType = {
    correctness: 0,
    design: 0,
    security: 0,
    reliability: 0,
    readability: 0,
    tests: 0,
  };

  const bySeverity = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const issue of issues) {
    const tk = typeKey(issue.type);
    if (tk) byType[tk] += 1;

    switch (String(issue.severity ?? "").toUpperCase()) {
      case "HIGH":
        bySeverity.high += 1;
        break;
      case "MEDIUM":
        bySeverity.medium += 1;
        break;
      default:
        bySeverity.low += 1;
        break;
    }
  }

  return {
    total_candidates: totalCandidates,
    filtered_count: issues.length,
    confidence_threshold: threshold,
    duplicates_removed: duplicatesRemoved,
    by_type: byType,
    by_severity: bySeverity,
  };
}

export function aggregateIssues(issueGroups: Issue[][], opts: AggregateOptions): AggregatedReview {
  const allIssues: Issue[] = issueGroups.flatMap((g) => g);
  const totalCandidates = allIssues.length;

  const threshold = Math.trunc(opts.confidenceThreshold);

  const { deduplicated, removed } = deduplicateIssues(allIssues);

  const filtered = deduplicated
    .filter((i) => typeof i.confidence === "number" && Number.isFinite(i.confidence) && i.confidence >= threshold)
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    issues: filtered,
    stats: computeStats(filtered, totalCandidates, threshold, removed),
  };
}

