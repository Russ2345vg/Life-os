# WALK-13 — Personal insights and recommendations

## Approval and scope

User approved the audited design in chat on 2026-08-26, including optional current-state entry.
Work only in `D:\LifeOS-App`, preserving the dirty WALK-01–12 baseline. No staging, commit,
push, dependencies, database migration, new worktree, or WALK-14 work.

## Sources and architecture

Walk owns intent, before/after scores, timestamps, pause-adjusted duration and outcome.
`Walk.mode` is timer/stopwatch, not the three intentions. WALK-12 selects completed Walks by
saved date in inclusive 7/30-day windows. Reuse that selection and paired-state rules.
There is no current-state store. Explicit state input is an optional session draft, never
inferred from the latest Walk. It is saved as beforeState only on confirmed ordinary launch.

The existing Evening RecommendationApplicationService persists even previews and can mutate
plans/Decisions; do not reuse it. Only its explainability/UI conventions are relevant.

Flow: WalkRepository → GetWalkAnalytics projection → pure WalkInsightEngine → pure
WalkRecommendationPolicy → Presentation. InsightEngine consumes ephemeral observation DTOs
from the same completed Walk snapshot. Analytics exposes derived evidence, not another store.
GetWalkRecommendation reads the existing analytics query for 30 days. All dependencies are
read-only; no RecommendationDatabase, history, cache, AI, LLM, ML or probability estimates.

## Rules

- Shared application confidence: fewer than 3 pairs means no insight; 3–7 preliminary;
  8+ stable observed pattern, never proof of causality. WALK-12 presentation uses this policy.
- Mode: recovery/tension or reflection/clarity (free/clarity may also be observed); require
  average favorable change >= 1 point and favorable change in strictly more than half of pairs.
- Duration: actual duration <20, 20–40 inclusive, >40 minutes. Compare within the same intent
  and metric, minimum 3 pairs in both groups. Winner has a strictly greater favorable fraction
  plus the same favorable mean/majority gate. Ties do not create an advantage.
- Time: local device timezone, startedAt only; morning [06,12), day [12,18), evening [18,24).
  Night and missing/invalid timestamps are excluded only from time comparisons. Historical
  timezone at the original location is not known and must not be implied.
- Before-state: recovery with before tension >=7, same favorable gates. Current high-state
  recommendation requires explicitly supplied current tension >=7; the historical cohort is
  described precisely as tension 7–10, not as an individualized medical classification.
- Each evidence object includes paired sampleSize, confidenceLevel, averageDelta and actual
  improvedCount. Comparisons carry both cohorts; confidence uses the smaller cohort.
- No missing value becomes zero. Legacy null intent is not inferred from Walk.type.
- Analytics shows at most four insights, with representation of the four supported kinds.
- Recommendation priority: current high tension with comparable recovery evidence; otherwise
  mode evidence ordered by confidence, sample size, fixed recovery/reflection/free tie order.
  No supported candidate → neutral ordinary selection. No efficacy score or optimality claim.

## Context and user control

Active Walk and pending Reentry retain existing precedence. Explicit Decision launch remains
reflection and explicit Routine launch keeps its source and user-selected intent. Routine
assignment contains no saved intent; never infer one from its title or alter the schedule.
Recommendations are mounted only in the idle center, not over these source launch flows.

One main CTA opens existing preparation with a suggested intent. Creation/start commands run
only after explicit preparation submit. Other modes and ordinary selector remain available.
Duration is the existing editable 30-minute default, clearly not a personalized optimum.
Optional current-state input is collapsed by default, starts unset, and is shared with
preparation as one React draft. Navigation, explanation, loading and retry do not persist it.
No feedback learning or persistence in v1.

## UI and evidence

Reference: user-provided LifeOS_Walks_Codex_Development_Plan_v1.1_Visual_Concepts.docx,
Concept A hierarchy and Concept D explanation, existing WALK-12 Analytics for observations.
Embedded A/D images inspected. DOCX page rendering is unavailable (soffice absent).
Reference promises, fake percentages, extra modes, weather and causal copy are not requirements.
User's explicit no-causality scope takes precedence.

Compact Center card: intent, editable duration default, short observation, primary start,
secondary Why and ordinary selection. Native accessible disclosure explains current context,
30-day range, observed mean/count and confidence with causality caveat. Analytics contains a
small Observations section with no recommendation CTAs. Loading/error/retry never masquerade
as low data or leave old personalized evidence attached to a new context.
Use LifeOS graphite/gold/green tokens. Verify desktop and mobile 360/390/430, focus, touch,
overflow, errors, and user choice with isolated synthetic browser data, never real user data.

## Verification

TDD engine/policy/query, presentation and integrated behavior. Cover 1/2/3/7/8 pairs, signs,
majority, duration boundaries/pauses, time boundaries/missing timestamps, missing snapshots,
comparative weakest confidence, evidence, deterministic priority and neutral selection.
Persistence integration compares Walk, Decision, Routine, Goal and Capture records before/after
queries and explanations; unchanged Reentry/version. Browser verifies explicit start only,
alternate mode, context transfer, Analytics/period changes, neutral/error/retry and all launch
precedence. Reuse WALK-08–12 regression suites.
Run typecheck, lint, test, test:alpha, test:e2e, build, format:check and Git whitespace checks.
Screenshots: Center, Why, Insights, low data, mobile. No video. All QA artifacts stay ignored.
