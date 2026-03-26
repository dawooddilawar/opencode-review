export type Severity = "HIGH" | "MEDIUM" | "LOW" | (string & {});

export type IssueType = "CORRECTNESS" | "DESIGN" | "SECURITY" | "RELIABILITY" | "READABILITY" | "TESTS" | (string & {});

export type Issue = {
    type?: IssueType;
    severity?: Severity;
    title?: string;
    file?: string;
    line?: number | string;
    evidence?: string;
    impact?: string;
    recommendation?: string;
    confidence?: number;
    /** Agents that reported this (or equivalent) finding; populated during deduplication. */
    reviewers?: string[];
    /** Set to true when distinct issues share the same file:line location. */
    coLocated?: boolean;
    // allow forward-compatible extra fields
    [key: string]: unknown;
};

export type ReviewStats = {
    total_candidates: number;
    filtered_count: number;
    confidence_threshold: number;
    duplicates_removed: number;
    by_type: {
        correctness: number;
        design: number;
        security: number;
        reliability: number;
        readability: number;
        tests: number;
    };
    by_severity: {
        high: number;
        medium: number;
        low: number;
    };
};

export type AggregatedReview = {
    issues: Issue[];
    stats: ReviewStats;
};
