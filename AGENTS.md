# Gaza Express — Backend engineering guidance

For tasks that review, design, implement, or change the backend, database, API contracts, infrastructure, or CI/CD:

- Read `docs/BACKEND_ENGINEERING_PROMPT.md` before substantial work and use its execution prompt as the project engineering guide.
- Match the mode to the user's request: `REVIEW`, `FIX`, `BUILD`, or `DESIGN`. A request to implement or fix authorizes scoped implementation; do not turn it into a review-only task.
- Apply the baseline rules and relevant technical sections to small changes. For a comprehensive review, cover every applicable section and report coverage gaps explicitly.
- Verify installed versions and existing behavior before proposing replacements. Preserve user changes and API compatibility unless the requested change requires otherwise.
- Support findings with real code paths or executed checks. Clearly distinguish observations, hypotheses, and proposals; never invent test results or performance claims.
- Use isolated test data and services. Do not expose secrets, run destructive database commands, or deploy to production without appropriate task authorization.
- Use `docs/BACKEND_ENGINEERING_SOURCES.md` for the reference bibliography and its stated reading limits. Consult official version-compatible documentation for implementation details.

Documentation-only tasks do not require running backend tests or performing a full architecture audit. Frontend-only work uses this guide only where backend contracts or security boundaries are affected.

Explicit user instructions define task scope and take precedence over these project defaults, subject to higher-priority system and developer instructions.
