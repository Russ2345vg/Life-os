---
name: lifeos-task-intake
description: Use when a LifeOS request still has material ambiguity in outcome, scope, or acceptance after reading available context.
---

# LifeOS task intake

Resolve the remaining ambiguity into a bounded, testable task.

Use existing context and prior approvals first. Follow `AGENTS.md` for autonomy, scope, and skill
priority. A clear or merely urgent implementation request does not need separate intake.

## Intake sequence

1. Use existing implementation, contracts and prior decisions to identify what is still unknown.
   Consult `docs/codex/PROJECT_MAP.md` when ownership or the implementation location is unclear.
2. Define the user outcome, observable acceptance criteria, affected modules and material assumptions.
   Inspect only the references and tests needed to resolve those decisions.
3. Select checks using `docs/codex/TEST_MATRIX.md`; for documentation/config, identify the
   authoritative files instead of inventing domain or UI requirements.

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
