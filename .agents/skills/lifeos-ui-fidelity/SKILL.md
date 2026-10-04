---
name: lifeos-ui-fidelity
description: Use when changing or auditing a LifeOS screen's visual layout, responsive behavior, or fidelity to an approved reference.
---

# LifeOS UI fidelity

Verify rendered behavior and visual hierarchy, not just JSX or CSS similarity.
Follow the design and Testing Stage Gate in `AGENTS.md`. A review request authorizes inspection
and findings, not implementation. Approved images and Figma nodes are both valid references;
absence of a main Figma file is not itself a blocker when the task has a usable reference.

## Workflow

1. Before design or edits, open the current route in the active worktree, capture desktop/mobile
   baseline and inspect existing components, CSS cascade, local overrides and computed styles.
   If the app is unavailable, inspect the code and disclose the missing browser baseline.
2. Apply the source priority and visual approval boundaries in AGENTS.md. Identify the task's
   approved image or Figma node, applicable states and viewport; without an approved reference,
   audit consistency with `docs/codex/UI_RULES.md` without claiming pixel fidelity. Inspect the
   presentation model, application commands and relevant tests; preserve their contracts.
3. Compare structure before polish: block order, hierarchy, density, relative sizing, CTA position, and responsive reflow.
4. Map colors, spacing, radii, typography, focus, and states to existing LifeOS tokens. Never hardcode reference sample data.
5. Run the real application at the actual route. Check the primary scenario plus loading, empty, disabled, error, success, and long-data states that apply.
6. Check desktop and mobile viewports from `UI_RULES.md`, including horizontal overflow, touch targets, keyboard focus, safe area, and reduced motion.
7. Inspect browser console and page errors. A visually plausible screen with runtime errors is not ready.
8. Compare rendered output with the source of truth and list concrete gaps. When implementation
   is authorized, refine within scope and repeat affected checks. During read-only review, report
   the gaps without editing. Reuse unchanged evidence; do not restart successful suites for reporting.

## Evidence and verdict

Report:

- reference and route used;
- viewports and states checked;
- confirmed matches;
- remaining visual or behavioral gaps;
- console/runtime result;
- targeted checks, applicable gate and any unperformed required check (R1 audits do not run full E2E);
- verdict: `готово`, `не готово`, or `Требуется ручная визуальная проверка`.

Do not claim pixel-perfect fidelity without a rendered comparison against an approved reference. Do not approve from static code review alone.
