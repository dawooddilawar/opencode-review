import type { AggregatedReview, Issue } from "./types";
import { agentIcon } from "./terminal";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

const BG_RED = "\x1b[41m";
const BG_YELLOW = "\x1b[43m";
const BG_BLUE = "\x1b[44m";

const WIDTH = 80;

function c(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case "HIGH":
      return RED;
    case "MEDIUM":
      return YELLOW;
    case "LOW":
      return BLUE;
    default:
      return WHITE;
  }
}

function severityBadge(severity: string): string {
  const s = severity.toUpperCase();
  switch (s) {
    case "HIGH":
      return `${BG_RED}${WHITE}${BOLD} HIGH ${RESET}`;
    case "MEDIUM":
      return `${BG_YELLOW}${BOLD} MEDIUM ${RESET}`;
    case "LOW":
      return `${BG_BLUE}${WHITE}${BOLD} LOW ${RESET}`;
    default:
      return `${DIM} ${s} ${RESET}`;
  }
}

function typeBadge(type: string): string {
  return c(`${DIM}`, `[${type.toUpperCase()}]`);
}

function hr(char = "─"): string {
  return c(DIM, char.repeat(WIDTH));
}

function wrapText(text: string, indent: number, maxWidth: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  const pad = " ".repeat(indent);
  const effectiveWidth = maxWidth - indent;

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= effectiveWidth) {
      currentLine += " " + word;
    } else {
      lines.push(pad + currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(pad + currentLine);
  return lines.join("\n");
}

function issueLine(issue: Issue): string {
  const file = issue.file ? String(issue.file) : "";
  const line = issue.line ?? "?";
  return file ? `${file}:${line}` : "?";
}

function bySeverity(issues: Issue[]): { high: Issue[]; medium: Issue[]; low: Issue[] } {
  const high: Issue[] = [];
  const medium: Issue[] = [];
  const low: Issue[] = [];

  for (const issue of issues) {
    const s = String(issue.severity ?? "").toUpperCase();
    if (s === "HIGH") high.push(issue);
    else if (s === "MEDIUM") medium.push(issue);
    else low.push(issue);
  }
  return { high, medium, low };
}

function renderIssue(lines: string[], issue: Issue, idx: number): void {
  const type = issue.type ? String(issue.type) : "";
  const title = issue.title ? String(issue.title) : "";
  const severity = issue.severity ? String(issue.severity).toUpperCase() : "";
  const conf = issue.confidence ?? "?";

  const num = c(`${BOLD}${severityColor(severity)}`, `  ${idx}.`);
  lines.push(`${num} ${typeBadge(type)} ${c(BOLD, title)}`);

  const badge = severityBadge(severity);
  const confStr =
    typeof conf === "number" && conf >= 80
      ? c(GREEN, `${conf}%`)
      : typeof conf === "number" && conf >= 50
        ? c(YELLOW, `${conf}%`)
        : c(DIM, `${conf}%`);
  lines.push(`     ${badge}  Confidence: ${confStr}`);

  const loc = issueLine(issue);
  lines.push(`     ${c(DIM, "📍")} ${c(CYAN, loc)}`);

  lines.push("");

  const impact = typeof issue.impact === "string" ? issue.impact.trim() : "";
  const recommendation = typeof issue.recommendation === "string" ? issue.recommendation.trim() : "";
  const evidence = typeof issue.evidence === "string" ? issue.evidence.trim() : "";

  if (impact) {
    lines.push(`     ${c(`${BOLD}${RED}`, "Impact:")}`);
    lines.push(wrapText(impact, 7, WIDTH));
    lines.push("");
  }

  if (recommendation) {
    lines.push(`     ${c(`${BOLD}${GREEN}`, "Recommendation:")}`);
    lines.push(wrapText(recommendation, 7, WIDTH));
    lines.push("");
  }

  if (evidence) {
    lines.push(`     ${c(`${BOLD}${MAGENTA}`, "Evidence:")}`);
    lines.push(wrapText(evidence, 7, WIDTH));
    lines.push("");
  }

  lines.push(c(DIM, "     " + "·".repeat(WIDTH - 5)));
  lines.push("");
}

function statBar(count: number, total: number, color: string, width = 20): string {
  if (total === 0) return c(DIM, "░".repeat(width));
  const filled = Math.round((count / total) * width);
  return c(color, "█".repeat(filled)) + c(DIM, "░".repeat(width - filled));
}

export function renderTerminal(data: AggregatedReview): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(c(`${BOLD}${CYAN}`, "  ╔═════════════════════════════════════════════════════╗"));
  lines.push(c(`${BOLD}${CYAN}`, "  ║") + c(`${BOLD}${WHITE}`, "              CODE REVIEW SUMMARY                    ") + c(`${BOLD}${CYAN}`, "║"));
  lines.push(c(`${BOLD}${CYAN}`, "  ╚═════════════════════════════════════════════════════╝"));
  lines.push("");

  const filtered = data.stats.filtered_count;
  const total = data.stats.total_candidates;
  const threshold = data.stats.confidence_threshold;

  if (filtered === 0) {
    lines.push(`  ${c(GREEN, "✅")} ${c(`${BOLD}${GREEN}`, "No high-confidence issues found!")}`);
    lines.push("");
    lines.push(`  ${c(DIM, "Checked:")} correctness, design, security, reliability, readability, tests`);
    lines.push(`  ${c(DIM, "Threshold:")} ${threshold}%`);
    if (total > 0) {
      lines.push("");
      lines.push(`  ${c(DIM, `ℹ  ${total} potential issue(s) found but filtered out (confidence < ${threshold}%)`)}`);
    }
    lines.push("");
    lines.push(hr());
    return lines.join("\n");
  }

  const deduped = data.stats.duplicates_removed ?? 0;
  const dedupNote = deduped > 0 ? `, ${deduped} duplicate(s) merged` : "";
  lines.push(`  ${c(BOLD, "Found")} ${c(`${BOLD}${WHITE}`, String(filtered))} ${c(BOLD, "issue(s)")} ${c(DIM, `(from ${total} candidates, threshold: ${threshold}%${dedupNote})`)}`);
  lines.push("");

  lines.push(hr());
  lines.push("");

  const high = data.stats.by_severity.high;
  const medium = data.stats.by_severity.medium;
  const low = data.stats.by_severity.low;

  lines.push(`  ${c(`${BOLD}`, "Severity Breakdown")}`);
  lines.push("");
  lines.push(`    ${c(RED, "HIGH")}     ${statBar(high, filtered, RED)}  ${c(BOLD, String(high))}`);
  lines.push(`    ${c(YELLOW, "MEDIUM")}   ${statBar(medium, filtered, YELLOW)}  ${c(BOLD, String(medium))}`);
  lines.push(`    ${c(BLUE, "LOW")}      ${statBar(low, filtered, BLUE)}  ${c(BOLD, String(low))}`);
  lines.push("");

  const types = (Object.keys(data.stats.by_type) as Array<keyof typeof data.stats.by_type>)
    .map((key) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), count: data.stats.by_type[key], icon: agentIcon(key) }))
    .filter((t) => t.count > 0);

  if (types.length > 0) {
    lines.push(`  ${c(`${BOLD}`, "Issue Types")}`);
    lines.push("");
    for (const t of types) {
      lines.push(`    ${t.icon} ${t.label.padEnd(14)} ${c(BOLD, String(t.count))}`);
    }
    lines.push("");
  }

  lines.push(hr("═"));
  lines.push("");

  const grouped = bySeverity(data.issues);
  let issueNo = 1;

  const sections: Array<{ label: string; severity: string; items: Issue[]; icon: string }> = [
    { label: "HIGH SEVERITY", severity: "HIGH", items: grouped.high, icon: "🔴" },
    { label: "MEDIUM SEVERITY", severity: "MEDIUM", items: grouped.medium, icon: "🟡" },
    { label: "LOW SEVERITY", severity: "LOW", items: grouped.low, icon: "🔵" },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;

    const sColor = severityColor(section.severity);
    lines.push(`  ${section.icon} ${c(`${BOLD}${sColor}`, section.label)} ${c(DIM, `(${section.items.length} issue${section.items.length > 1 ? "s" : ""})`)}`);
    lines.push(hr());
    lines.push("");

    for (const issue of section.items) {
      renderIssue(lines, issue, issueNo);
      issueNo += 1;
    }
  }

  lines.push(c(`${BOLD}${CYAN}`, "  ══════════════════════════════════════════════════════════════"));
  return lines.join("\n");
}
