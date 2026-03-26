# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open source release
- Parallel AI agent system with 6 built-in agents (security, correctness, design, readability, tests, reliability)
- Auto-discovery of agents from `agents/*.md` files
- Confidence-based filtering to reduce false positives
- Synthesizer pass for final deduplication and validation
- Support for multiple LLM providers via opencode.ai
- Local model support via Ollama
- Shallow and deep review modes
- JSON and Markdown output formats
- `--fail-on-issues` flag for CI/CD integration
- Interactive model selection with `--set-model`
- Comprehensive unit tests using Node.js built-in test framework
- GitHub Actions CI workflow
- Zero runtime npm dependencies

### Changed
- Migrated from shell script installation to npm package
- Renamed package to `opencode-review`

### Removed
- Bitbucket integration (simplified for local/CI focus)

## [1.0.0] - 2026-03-26

### Added
- Initial release as `opencode-review`
- MIT License
- Full documentation (README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT)
- Issue and PR templates
- Cross-platform support via npm
