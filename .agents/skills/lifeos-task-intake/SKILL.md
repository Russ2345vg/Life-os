---
name: lifeos-task-intake
description: Use when a LifeOS request is vague, urgent, broad, or not yet ready for implementation planning.
---

# LifeOS task intake

Turn the request into a bounded, testable task before proposing code changes.

Use existing context and prior approvals first. Follow `AGENTS.md` for autonomy, scope, and skill
priority. A clear implementation request does not need a separate intake ceremony.

## Intake sequence

1. State the user outcome in one sentence.
2. Describe the primary user scenario from entry point to visible result.
3. Separate constraints and explicit non-goals from assumptions.
4. Define observable acceptance criteria. Avoid implementation details unless the request fixes them.
5. Inspect the current implementation, approved references, domain contracts, and tests read-only.
6. Identify the likely affected layers and modules using `docs/codex/PROJECT_MAP.md`.
7. Record concrete risks relevant to this task, not a checklist of hypothetical concerns.
8. Select the smallest relevant checks using `docs/codex/TEST_MATRIX.md`.

Ask one concise question only when the missing answer cannot be found in available context and
would materially change scope, architecture, user data, or acceptance. Continue independent work
while that answer is pending. Otherwise state the assumption and proceed.

## Required output

Summarize the outcome, affected ownership/modules, acceptance evidence, material assumptions and
selected checks in concise Russian prose. Use a list or table only when it improves clarity.
For a documentation/config task, identify its authoritative files; domain/UI fields may not apply.

For an intake-only request, deliver the scoped result. When implementation is already requested,
continue to the applicable design gate, plan and execution once intake is complete. A standard
form using existing components can proceed with a defined design contract; mandatory visual
approval for a major or unique new screen still follows `AGENTS.md`.
