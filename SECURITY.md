# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in `opencode-review`, please **do not open a public issue**.

Instead, send an email to: **dawood@dawooddilawar.com**

Please include:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Affected versions** you've tested
- **Potential impact** if exploited

### What to Expect

1. **Confirmation** — I'll respond within 48 hours to acknowledge receipt
2. **Investigation** — I'll investigate and assess the severity
3. **Resolution** — I'll work on a fix and coordinate disclosure with you
4. **Disclosure** — Once fixed, I'll publicly disclose the vulnerability and credit you (if desired)

### Security Best Practices for This Tool

`opencode-review` is designed with security in mind:

- **No code execution** — Agents analyze diffs but don't run code
- **No credential storage** — API keys managed by `opencode` CLI
- **Read-only operations** — Only reads git diffs and files
- **Local execution** — All processing happens on your machine

However, be aware:

- **Diff content** is sent to LLM providers (respect their privacy policies)
- **Model choice** matters — self-hosted models (Ollama) keep data local
- **CI logs** may contain code snippets if using `--verbose`

### Dependency Security

This project has **zero runtime npm dependencies**. Only build-time dependencies:

- `typescript` — Build tool
- `@types/node` — TypeScript definitions

Always report vulnerabilities in:
- Node.js runtime itself
- `opencode` CLI (separate project: https://github.com/opencode-dev/opencode)

## Security Audits

This project has not yet undergone a formal security audit. Contributions for security hardening are welcome!

### Areas of Interest

If you're looking to contribute security improvements, consider:

- Input validation for file paths
- Diff sanitization before sending to LLMs
- Config file permissions
- Environment variable handling
- Shell command injection prevention

---

Thanks for helping keep `opencode-review` secure! :lock:
