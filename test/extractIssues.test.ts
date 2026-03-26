import test from "node:test";
import assert from "node:assert/strict";

import { extractIssues } from "../src/extractIssues";

test("extractIssues: extracts from ```json fenced block", () => {
  const raw = [
    "Some preface text",
    "```json",
    '{ "issues": [ { "type": "LOGIC", "confidence": 85, "line": 12 } ] }',
    "```",
    "Some trailing text",
  ].join("\n");

  const result = extractIssues(raw);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.type, "LOGIC");
  assert.equal(result.issues[0]?.confidence, 85);
  assert.equal(result.issues[0]?.line, 12);
});

test("extractIssues: extracts embedded JSON object without fences", () => {
  const raw = [
    "LLM says:",
    '{ "foo": 1 }',
    "then later:",
    '{ "issues": [ { "type": "SECURITY", "confidence": "90", "line": "7" } ] }',
    "done",
  ].join("\n");

  const result = extractIssues(raw);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.type, "SECURITY");
  assert.equal(result.issues[0]?.confidence, 90);
  assert.equal(result.issues[0]?.line, 7);
});

test("extractIssues: returns empty when no issues payload exists", () => {
  const raw = "no json here";
  const result = extractIssues(raw);
  assert.deepEqual(result, { issues: [] });
});

