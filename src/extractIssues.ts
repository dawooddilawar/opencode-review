export type Issue = Record<string, unknown> & {
  confidence?: number;
  line?: number | string;
};

export type IssuesPayload = {
  issues: Issue[];
};

function isIssuesPayload(value: unknown): value is IssuesPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { issues?: unknown };
  return Array.isArray(v.issues);
}

function normalize(payload: IssuesPayload): IssuesPayload {
  const normalized: Issue[] = [];

  for (const rawIssue of payload.issues) {
    if (typeof rawIssue !== "object" || rawIssue === null) continue;
    const issue = { ...(rawIssue as Record<string, unknown>) } as Issue;

    if (issue.confidence !== undefined) {
      const n = Number(issue.confidence);
      if (Number.isFinite(n)) issue.confidence = Math.trunc(n);
      else delete issue.confidence;
    }

    if (issue.line !== undefined && issue.line !== null) {
      const n = Number(issue.line);
      if (Number.isFinite(n)) issue.line = Math.trunc(n);
      else issue.line = String(issue.line);
    }

    normalized.push(issue);
  }

  return { issues: normalized };
}

function tryParseJsonObject(s: string): IssuesPayload | null {
  try {
    const obj = JSON.parse(s);
    if (isIssuesPayload(obj)) return normalize(obj);
  } catch {
    // ignore
  }
  return null;
}

function extractFromFencedBlocks(content: string): IssuesPayload | null {
  const regex = /```json\s*(\{[\s\S]*?\})\s*```/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    blocks.push(m[1] ?? "");
  }

  for (let i = blocks.length - 1; i >= 0; i--) {
    const payload = tryParseJsonObject(blocks[i]!);
    if (payload) return payload;
  }

  return null;
}

function scanForJsonObjects(content: string): IssuesPayload | null {
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "{") continue;
    // Try to find a valid JSON object by expanding end boundary.
    for (let j = i + 1; j <= content.length; j++) {
      if (content[j - 1] !== "}") continue;
      const candidate = content.slice(i, j);
      const payload = tryParseJsonObject(candidate);
      if (payload) return payload;
    }
  }
  return null;
}

export function extractIssues(raw: string): IssuesPayload {
  const fromFence = extractFromFencedBlocks(raw);
  if (fromFence) return fromFence;

  const fromScan = scanForJsonObjects(raw);
  if (fromScan) return fromScan;

  return { issues: [] };
}

