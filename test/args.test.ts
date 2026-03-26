import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODEL, parseArgs } from "../src/args";

test("parseArgs: defaults", () => {
  const args = parseArgs([]);
  assert.equal(args.model, DEFAULT_MODEL);
  assert.equal(args.baseBranch, "main");
  assert.equal(args.confidenceThreshold, 80);
  assert.equal(args.verbose, false);
  assert.equal(args.format, "terminal");
  assert.equal(args.localOnly, false);
  assert.equal(args.saveDefaults, false);
  assert.equal(args.help, false);
  assert.equal(args.explicitModel, false);
  assert.equal(args.explicitBaseBranch, false);
  assert.equal(args.explicitConfidence, false);
});

test("parseArgs: parses short flags", () => {
  const args = parseArgs(["-m", "ollama/qwen3:8b", "-b", "develop", "-c", "70", "-v"]);
  assert.equal(args.model, "ollama/qwen3:8b");
  assert.equal(args.baseBranch, "develop");
  assert.equal(args.confidenceThreshold, 70);
  assert.equal(args.verbose, true);
  assert.equal(args.explicitModel, true);
  assert.equal(args.explicitBaseBranch, true);
  assert.equal(args.explicitConfidence, true);
});

test("parseArgs: parses --format and --save-defaults", () => {
  const args = parseArgs(["--format", "markdown", "--save-defaults"]);
  assert.equal(args.format, "markdown");
  assert.equal(args.saveDefaults, true);
});

test("parseArgs: rejects invalid format", () => {
  assert.throws(() => parseArgs(["--format", "xml"]), /Invalid --format/);
});

test("parseArgs: parses --local-only", () => {
  const args = parseArgs(["--local-only"]);
  assert.equal(args.localOnly, true);
});

test("parseArgs: rejects unknown option", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
});

