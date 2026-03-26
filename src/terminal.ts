import { API_ERROR_PATTERNS } from "./runAgents";
import type { AgentRunResult } from "./runAgents";

// ── ANSI escape codes ──────────────────────────────────────────────

export const T_RESET = "\x1b[0m";
export const T_BOLD = "\x1b[1m";
export const T_DIM = "\x1b[2m";
export const T_RED = "\x1b[31m";
export const T_GREEN = "\x1b[32m";
export const T_YELLOW = "\x1b[33m";
export const T_CYAN = "\x1b[36m";
export const T_WHITE = "\x1b[37m";

export function tc(color: string, text: string): string {
    return `${color}${text}${T_RESET}`;
}

// ── Formatting helpers ─────────────────────────────────────────────

export function firstLines(s: string, maxLines = 8): string {
    return s.split("\n").slice(0, maxLines).join("\n").trim();
}

export function formatTimestamp(ms: number): string {
    return new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    if (totalSeconds < 3600) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}

// ── Error helpers ──────────────────────────────────────────────────

/** Returns lines from stderr that match a known API error pattern. */
function extractApiErrorLines(stderr: string): string[] {
    return stderr
        .split("\n")
        .filter(line => API_ERROR_PATTERNS.some(p => p.test(line)))
        .slice(0, 5);
}

// ── Agent display helpers ──────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
    correctness: "🐛",
    design: "📐",
    security: "🔒",
    reliability: "⚡",
    readability: "📖",
    tests: "🧪",
    synthesizer: "🔬",
};

export function agentIcon(agent: string): string {
    return AGENT_ICONS[agent] ?? "▸";
}

// ── Agent status derivation (single source of truth) ───────────────

export type AgentStatus = "OK" | "FAILED" | "TIMED_OUT" | "MODEL_NOT_FOUND" | "API_ERROR";

export function deriveAgentStatus(
    r: Pick<AgentRunResult, "modelNotFound" | "timedOut" | "exitCode" | "apiError">,
): AgentStatus {
    if (r.modelNotFound) return "MODEL_NOT_FOUND";
    if (r.apiError) return "API_ERROR";
    if (r.timedOut) return "TIMED_OUT";
    if (r.exitCode !== 0) return "FAILED";
    return "OK";
}

export function statusDisplay(status: AgentStatus): string {
    switch (status) {
        case "OK":
            return tc(`${T_BOLD}${T_GREEN}`, "✓ OK");
        case "FAILED":
            return tc(`${T_BOLD}${T_RED}`, "✗ FAILED");
        case "TIMED_OUT":
            return tc(`${T_BOLD}${T_YELLOW}`, "⏱ TIMED OUT");
        case "MODEL_NOT_FOUND":
            return tc(`${T_BOLD}${T_RED}`, "⚠ MODEL NOT FOUND");
        case "API_ERROR":
            return tc(`${T_BOLD}${T_RED}`, "⚠ API ERROR");
    }
}

// ── Box drawing ────────────────────────────────────────────────────

function boxLine(width: number): string {
    return "═".repeat(width);
}

function printBox(title: string, innerWidth: number, stream: NodeJS.WriteStream = process.stdout): void {
    const padded = title.padEnd(innerWidth);
    stream.write(tc(`${T_BOLD}${T_CYAN}`, `  ╔${boxLine(innerWidth)}╗\n`));
    stream.write(
        tc(`${T_BOLD}${T_CYAN}`, "  ║") + tc(`${T_BOLD}${T_WHITE}`, padded) + tc(`${T_BOLD}${T_CYAN}`, "║\n"),
    );
    stream.write(tc(`${T_BOLD}${T_CYAN}`, `  ╚${boxLine(innerWidth)}╝\n`));
}

function separator(width = 62): void {
    process.stdout.write(`${tc(T_DIM, `  ${"─".repeat(width)}`)}\n`);
}

// ── Print functions ────────────────────────────────────────────────
function printBannerTo(stream: NodeJS.WriteStream): void {
    printBox("                  AI CODE REVIEW", 62, stream);
}

export function printBanner(model: string, baseBranch: string, reviewMode?: string): void {
    process.stderr.write("\n");
    printBannerTo(process.stderr);
    process.stderr.write("\n");
    process.stderr.write(`  ${tc(T_DIM, "Model")}        ${tc(T_WHITE, model)}\n`);
    process.stderr.write(`  ${tc(T_DIM, "Base branch")}  ${tc(T_WHITE, baseBranch)}\n`);
    if (reviewMode) {
        process.stderr.write(`  ${tc(T_DIM, "Mode")}         ${tc(T_WHITE, reviewMode)}\n`);
    }
    process.stderr.write("\n");
    process.stderr.write(`${tc(T_DIM, `  ${"─".repeat(62)}`)}\n`);
    process.stderr.write("\n");
}

export function printVerboseInlineIssues(result: AgentRunResult): void {
    if (result.issues.length === 0) return;
    for (const issue of result.issues) {
        const sev = String(issue.severity ?? "").toUpperCase();
        const sevColor = sev === "HIGH" ? T_RED : sev === "MEDIUM" ? T_YELLOW : T_DIM;
        const title = issue.title ?? "(no title)";
        const conf = issue.confidence != null ? `${issue.confidence}%` : "?";
        const loc = issue.file ? `${issue.file}:${issue.line ?? "?"}` : "";
        process.stderr.write(
            `    ${tc(sevColor, sev.padEnd(6))} ${tc(T_WHITE, title)} ${tc(T_DIM, `[${conf}]`)}${loc ? ` ${tc(T_CYAN, loc)}` : ""}\n`,
        );
    }
}

export function printVerboseAgentDetails(results: AgentRunResult[]): void {
    process.stdout.write(`  ${tc(T_BOLD, "Detailed Agent Output")} ${tc(T_DIM, "(-v)")}\n`);
    separator();

    results.forEach(r => {
        const status = deriveAgentStatus(r);
        process.stdout.write(`\n  ${tc(`${T_BOLD}${T_CYAN}`, `▸ ${r.agent}`)} ${statusDisplay(status)}\n`);
        process.stdout.write(
            `    ${tc(T_DIM, "exit=")}${r.exitCode} ${tc(T_DIM, "timedOut=")}${r.timedOut} ${tc(T_DIM, "issues=")}${r.issues.length} ${tc(T_DIM, "duration=")}${formatDuration(r.durationMs)}\n`,
        );
        const stderrPreview = firstLines(r.rawStderr);
        const shouldShowStderr = r.exitCode !== 0 || r.timedOut || r.modelNotFound || r.apiError || /error|warn/i.test(stderrPreview);
        if (stderrPreview && shouldShowStderr) {
            process.stdout.write(`    ${tc(T_DIM, "stderr:")}\n`);
            process.stdout.write(
                `${stderrPreview
                    .split("\n")
                    .map(line => `      ${tc(T_DIM, line)}`)
                    .join("\n")}\n`,
            );
        }
        if (r.apiError) {
            const errorLines = extractApiErrorLines(r.rawStderr);
            if (errorLines.length > 0) {
                process.stdout.write(`    ${tc(`${T_BOLD}${T_RED}`, "api error (from stderr):")}\n`);
                errorLines.forEach(line =>
                    process.stdout.write(`      ${tc(T_RED, line.trim())}\n`),
                );
            }
        }
    });
    process.stdout.write("\n");
}

export function printTimingSummary(
    reviewStartMs: number,
    reviewEndMs: number,
    results: Pick<AgentRunResult, "agent" | "durationMs">[],
): void {
    process.stdout.write("\n");
    printBox("               TIMING STATISTICS                     ", 53);
    process.stdout.write("\n");
    process.stdout.write(`  ${tc(T_DIM, "Started:")}   ${formatTimestamp(reviewStartMs)}\n`);
    process.stdout.write(`  ${tc(T_DIM, "Finished:")}  ${formatTimestamp(reviewEndMs)}\n`);
    process.stdout.write(`  ${tc(T_DIM, "Duration:")}  ${tc(T_BOLD, formatDuration(reviewEndMs - reviewStartMs))}\n`);
    process.stdout.write("\n");
    separator();
    process.stdout.write("\n");
    process.stdout.write(`  ${tc(T_BOLD, "Agent Breakdown:")}\n\n`);

    const maxDuration = Math.max(...results.map(r => r.durationMs), 1);
    const barWidth = 25;

    results.forEach(r => {
        const filled = Math.round((r.durationMs / maxDuration) * barWidth);
        const bar = tc(T_CYAN, "█".repeat(filled)) + tc(T_DIM, "░".repeat(barWidth - filled));
        process.stdout.write(
            `  ${tc(T_BOLD, r.agent.padEnd(14))} ${bar} ${tc(T_BOLD, formatDuration(r.durationMs).padEnd(8))}\n`,
        );
    });
    process.stdout.write("\n");
    process.stdout.write(`${tc(`${T_BOLD}${T_CYAN}`, `  ${"═".repeat(62)}`)}\n`);
}
