---
name: lifeos-bug-repair
description: Use when diagnosing or repairing a concrete LifeOS defect, failing test, hang, or regression.
---

# LifeOS bug repair

Repair the confirmed cause with regression evidence. Do not mask symptoms or broaden scope.
Follow `AGENTS.md` for authorization and testing scope. For a diagnosis-only request, investigate
and report the cause; proceed to repair only when the user requested or already authorized it.

## Investigation

1. Capture the exact symptom, command or user path, environment, expected result, actual result, frequency, and last useful output.
2. Reproduce the smallest case. If a command may hang, use bounded observation and preserve the last completed step.
3. Read the execution path across presentation, application, domain, and infrastructure. Identify the owner of the broken invariant.
4. Gather facts before proposing fixes. For hangs, distinguish watch/interactive mode, a slow test, an open handle, an unresolved promise, and an incorrect script.
5. State one falsifiable root-cause hypothesis and the evidence that would confirm or reject it.

## Repair

1. Add or identify a regression check that fails for the confirmed reason.
2. Make the smallest change at the owning layer. Preserve architecture, persistence, date, and user-data contracts.
3. Avoid timeout increases, retries, broad cleanup, test weakening, and error suppression unless evidence shows they are the correct behavior.
4. Run the regression check repeatedly when the defect is timing-sensitive.
5. Run neighboring checks for the touched invariant, then select the applicable gate from
   `docs/codex/TEST_MATRIX.md`. Preserve successful evidence under AGENTS.md Testing Stage Gate.

## Required report

Include:

- exact reproduction and evidence;
- confirmed root cause, or remaining hypotheses if not confirmed;
- regression check;
- minimal repair and why it belongs in that layer;
- neighboring risks checked;
- fresh command results and unresolved limitations.

If the defect cannot be reproduced, report that fact and the bounded evidence. Do not invent a cause or claim a repair.
