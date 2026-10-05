# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first: every rule there applies, and it overrides your defaults.

Claude-specific additions:

- Plan before any multi-file change. For a new endpoint, entity or screen, list the rule ids (R-, S-, BR-, V-) and test ids you will touch before editing.
- Stay inside the current phase of [docs/ROADMAP.md](docs/ROADMAP.md). Do not add features "while you are there".
- Never claim a change works without running `scripts/dev.sh check` and the smoke scripts; paste their summary lines.
- Do not commit, push or deploy unless the user says so in this conversation.
- Never print or paste the contents of `env/local.env`, tokens, OTPs or decrypted personal data.
- Use relative markdown links for file references, e.g. [lib/scope.ts](services/pension-auth-service/src/lib/scope.ts).
- No em dashes and no "--" in any user-facing text you write.
