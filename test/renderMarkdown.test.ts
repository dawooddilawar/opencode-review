import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../src/renderMarkdown";
import type { AggregatedReview } from "../src/types";

test("renderMarkdown: returns empty string when there are no issues (default policy)", () => {
  const data: AggregatedReview = {
    issues: [],
    stats: {
      total_candidates: 0,
      filtered_count: 0,
      confidence_threshold: 80,
      duplicates_removed: 0,
      by_type: { correctness: 0, design: 0, security: 0, reliability: 0, readability: 0, tests: 0 },
      by_severity: { high: 0, medium: 0, low: 0 },
    },
  };

  assert.equal(renderMarkdown(data), "");
});

test("renderMarkdown: renders issues with impact/recommendation/evidence", () => {
  const data: AggregatedReview = {
    issues: [
      {
        type: "SECURITY",
        severity: "HIGH",
        title: "SQL injection risk",
        file: "src/a.ts",
        line: 12,
        confidence: 92,
        impact: "Attacker can read data",
        recommendation: "Use parameterized queries",
        evidence: "User input concatenated into SQL string",
      },
    ],
    stats: {
      total_candidates: 1,
      filtered_count: 1,
      confidence_threshold: 80,
      duplicates_removed: 0,
      by_type: { correctness: 0, design: 0, security: 1, reliability: 0, readability: 0, tests: 0 },
      by_severity: { high: 1, medium: 0, low: 0 },
    },
  };

  const md = renderMarkdown(data);
  assert.match(md, /### AI code review/);
  assert.match(md, /Found \*\*1\*\* issue/);
  assert.match(md, /\*\*\[SECURITY\]\[HIGH\] SQL injection risk\*\*/);
  assert.match(md, /`src\/a\.ts:12`/);
  assert.match(md, /Impact: Attacker can read data/);
  assert.match(md, /Recommendation: Use parameterized queries/);
  assert.match(md, /Evidence: User input concatenated/);
});

test("renderMarkdown: can render a short 'no issues' comment when enabled", () => {
  const data: AggregatedReview = {
    issues: [],
    stats: {
      total_candidates: 2,
      filtered_count: 0,
      confidence_threshold: 80,
      duplicates_removed: 0,
      by_type: { correctness: 0, design: 0, security: 0, reliability: 0, readability: 0, tests: 0 },
      by_severity: { high: 0, medium: 0, low: 0 },
    },
  };

  const md = renderMarkdown(data, { renderEmpty: true });
  assert.match(md, /No issues found/);
  assert.match(md, /threshold: 80%/);
});

