import test from "node:test";
import assert from "node:assert/strict";

import { aggregateIssues, deduplicateIssues } from "../src/aggregate";
import type { Issue } from "../src/types";

test("aggregateIssues: merges, filters by confidence, sorts by severity, computes stats", () => {
  const issuesA: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "s1", confidence: 90, file: "a.ts", line: 1 },
    { type: "DESIGN", severity: "LOW", title: "q1", confidence: 79, file: "a.ts", line: 2 },
  ];

  const issuesB: Issue[] = [
    { type: "CORRECTNESS", severity: "MEDIUM", title: "l1", confidence: 80, file: "b.ts", line: 10 },
    { type: "TESTS", severity: "LOW", title: "t1", confidence: 100, file: "b.ts", line: 11 },
    // missing confidence should be treated as non-candidate for filtering
    { type: "RELIABILITY", severity: "HIGH", title: "p1", file: "b.ts", line: 12 },
  ];

  const result = aggregateIssues([issuesA, issuesB], { confidenceThreshold: 80 });

  assert.equal(result.stats.total_candidates, 5);
  assert.equal(result.stats.filtered_count, 3);
  assert.equal(result.stats.confidence_threshold, 80);
  assert.equal(result.stats.duplicates_removed, 0);

  // Sorted by severity: HIGH -> MEDIUM -> LOW
  assert.deepEqual(
    result.issues.map((i) => `${i.severity}:${i.title}`),
    ["HIGH:s1", "MEDIUM:l1", "LOW:t1"],
  );

  assert.deepEqual(result.stats.by_severity, { high: 1, medium: 1, low: 1 });
  assert.deepEqual(result.stats.by_type, {
    correctness: 1,
    design: 0,
    security: 1,
    reliability: 0,
    readability: 0,
    tests: 1,
  });
});

// --- Deduplication unit tests ---

test("deduplicateIssues: merges same file:line + same title", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "MEDIUM", title: "SQL injection risk", file: "db.ts", line: 42, confidence: 85, evidence: "short" },
    { type: "LOGIC", severity: "HIGH", title: "SQL injection risk", file: "db.ts", line: 42, confidence: 90, evidence: "longer evidence text" },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 1);
  assert.equal(removed, 1);
  assert.equal(deduplicated[0]!.severity, "HIGH");
  assert.equal(deduplicated[0]!.confidence, 90);
  assert.equal(deduplicated[0]!.evidence, "longer evidence text");
  assert.ok(deduplicated[0]!.reviewers!.includes("security"));
  assert.ok(deduplicated[0]!.reviewers!.includes("logic"));
  assert.equal(deduplicated[0]!.coLocated, undefined);
});

test("deduplicateIssues: keeps separate findings for same file:line but different titles", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "SQL injection", file: "db.ts", line: 42, confidence: 90 },
    { type: "QUALITY", severity: "LOW", title: "Poor naming", file: "db.ts", line: 42, confidence: 80 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 2);
  assert.equal(removed, 0);
  assert.ok(deduplicated.every((d) => d.coLocated === true));
});

test("deduplicateIssues: keeps separate findings for same title but different locations", () => {
  const issues: Issue[] = [
    { type: "LOGIC", severity: "HIGH", title: "Null dereference", file: "a.ts", line: 10, confidence: 90 },
    { type: "LOGIC", severity: "HIGH", title: "Null dereference", file: "b.ts", line: 20, confidence: 85 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 2);
  assert.equal(removed, 0);
});

test("deduplicateIssues: uses highest severity among merged findings", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "LOW", title: "XSS vulnerability", file: "ui.ts", line: 5, confidence: 70 },
    { type: "QUALITY", severity: "HIGH", title: "XSS vulnerability", file: "ui.ts", line: 5, confidence: 95 },
    { type: "LOGIC", severity: "MEDIUM", title: "XSS vulnerability", file: "ui.ts", line: 5, confidence: 80 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 1);
  assert.equal(removed, 2);
  assert.equal(deduplicated[0]!.severity, "HIGH");
  assert.equal(deduplicated[0]!.confidence, 95);
});

test("deduplicateIssues: merges conflicting recommendations with attribution", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "Auth bypass", file: "auth.ts", line: 10, confidence: 90, recommendation: "Use JWT tokens" },
    { type: "LOGIC", severity: "HIGH", title: "Auth bypass", file: "auth.ts", line: 10, confidence: 88, recommendation: "Add middleware check" },
  ];

  const { deduplicated } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 1);
  assert.ok(deduplicated[0]!.recommendation!.includes("Use JWT tokens"));
  assert.ok(deduplicated[0]!.recommendation!.includes("[Alternative]"));
  assert.ok(deduplicated[0]!.recommendation!.includes("Add middleware check"));
});

test("deduplicateIssues: title matching is case-insensitive and whitespace-collapsed", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "SQL Injection  Risk", file: "db.ts", line: 42, confidence: 90 },
    { type: "LOGIC", severity: "MEDIUM", title: "sql injection risk", file: "db.ts", line: 42, confidence: 85 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 1);
  assert.equal(removed, 1);
});

test("deduplicateIssues: issues without file are passed through unchanged", () => {
  const issues: Issue[] = [
    { type: "QUALITY", severity: "LOW", title: "General style issue", confidence: 80 },
    { type: "QUALITY", severity: "LOW", title: "General style issue", confidence: 75 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 2);
  assert.equal(removed, 0);
});

test("deduplicateIssues: line as string matches line as number", () => {
  const issues: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "Buffer overflow", file: "c.ts", line: 99, confidence: 90 },
    { type: "LOGIC", severity: "MEDIUM", title: "Buffer overflow", file: "c.ts", line: "99", confidence: 85 },
  ];

  const { deduplicated, removed } = deduplicateIssues(issues);

  assert.equal(deduplicated.length, 1);
  assert.equal(removed, 1);
});

test("aggregateIssues: end-to-end deduplication integrated with confidence filter", () => {
  const group1: Issue[] = [
    { type: "SECURITY", severity: "HIGH", title: "SQL injection", file: "db.ts", line: 10, confidence: 90 },
    { type: "QUALITY", severity: "LOW", title: "Bad naming", file: "db.ts", line: 10, confidence: 85 },
  ];
  const group2: Issue[] = [
    { type: "LOGIC", severity: "MEDIUM", title: "SQL injection", file: "db.ts", line: 10, confidence: 70 },
    { type: "PERFORMANCE", severity: "HIGH", title: "N+1 query", file: "api.ts", line: 5, confidence: 95 },
  ];

  const result = aggregateIssues([group1, group2], { confidenceThreshold: 80 });

  assert.equal(result.stats.total_candidates, 4);
  assert.equal(result.stats.duplicates_removed, 1);
  // After dedup: SQL injection (merged, conf 90), Bad naming (conf 85), N+1 query (conf 95)
  // All three pass the 80% threshold
  assert.equal(result.stats.filtered_count, 3);
});

