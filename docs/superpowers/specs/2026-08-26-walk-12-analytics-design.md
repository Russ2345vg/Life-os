# WALK-12 — Analytics v1

## Approval and scope

The user approved the minimal design in chat on 2026-08-26 after the read-only audit.
Workspace: `D:\LifeOS-App`. WALK-01–11 are the protected dirty baseline.
Only the main agent writes. No commit, staging, push, new worktree, dependency, or schema change.
No WALK-13, recommendation, AI insight, forecast, causal/medical claim, GPS, maps, or weather.

## Existing analytics infrastructure

- `GetWalkStatistics` already defines inclusive 7/30 calendar periods and completed actual
  duration aggregates. Its five `Walk.type` buckets are not the three user-facing intentions.
- `Walk.intent` is `free | recovery | reflection | null`; `Walk.mode` means stopwatch/timer.
- `Walk` owns actual pause-adjusted duration, before/after snapshots, impact and text result.
  There is no separate persisted WalkOutcome entity to invent.
- `WalkCaptureRepository.findByWalkId` reads pending and processed thoughts from the existing
  indexed store. The contextual capture query is unnecessary for aggregate counts.
- `GetWalkHistory` provides completed details and exact intent filtering, but no date filter.
- Evening Analytics offers a 7/30 switch and lightweight CSS bar pattern. Its recommendation
  services are not reused. Walks Analytics stays within the Walks section.

## Proposed minimal WALK-12 patch

Add `GetWalkAnalytics`, a read-only application projection. Extract the existing statistics
period/duration calculation into one pure application module, retaining the exact public
`GetWalkStatistics` contract. Each analytics request reads Walks once, then captures only for
the selected completed Walks. Never create an analytics database, record, cache store, migration,
backfill or mutation command. A query error is visible and retryable, never converted to zero.

### Period and formulas

Default: 30 days; alternative: 7 days. No 90-day option.
Use `CurrentDateProvider` and `Walk.date`, not `endedAt`, `updatedAt`, or capture time.
Inclusive ranges: `[today - 29, today]` and `[today - 6, today]`; exclude future dates.
Let C be the completed Walks in the range:

- Count = `C.length`; days = number of distinct saved Walk dates.
- Total time = sum of `actualDurationMilliseconds`; average = total/count, or null if empty.
  Completed domain Walks guarantee start/end and a numeric duration. Valid zero is included.
- Each intention gets count and average duration. Legacy `intent:null` stays in the total and
  is explained separately as “Без указанного режима”, never inferred from legacy type.
- For each energy/tension/clarity metric, select pairs with both values present. Return its
  own sample size, average before, average after and average `(after - before)`. No missing
  value is replaced by zero. Empty averages are null; round only for display.
- Impact counts use only the saved `better | same | worse` value, never derived from deltas.
- Text-result count uses nonempty `result.trim()`.
- With-thoughts count counts each selected Walk once when it has at least one capture,
  including processed captures. Also expose the actual total number of captures as a fact.
- Daily counts include all 7/30 dates, with true zero activity days.

### Sample-size rules

Apply thresholds to the relevant paired metric, including each intention's own subset:
0: no paired data; 1–2: numbers/facts only; 3–7: “Предварительное наблюдение” with an explicit
small-sample caveat; 8+: the permitted stable-observation category. This is a product sample
threshold, not statistical proof or a causal claim. The neutral lead-in is
“Среднее изменение после прогулок:”; observation categories retain explicit caveats.
Per-intention state averages are displayed from three pairs; below that, show the sample count
and that data is insufficient for comparison. No combined effectiveness score or mode ranking.

## Presentation and navigation

Add a sibling read-only Analytics sub-screen to the existing History entry in WalksPage.
Order: header/back/7–30 switch; four compact KPIs; state changes; three intention cards;
walks-by-day bars; additional outcome/thought facts. Reuse LifeOS tokens and focus conventions.

Reference: approved DOCX `LifeOS_Walks_Codex_Development_Plan_v1.1_Visual_Concepts.docx`,
§17 and Concept B. It controls hierarchy/density/style, not extra dashboard features.
Original embedded Concept B was inspected; page rendering is unavailable because LibreOffice
is absent. Do not claim pixel identity or import sample values from the reference.

- Empty: “Недостаточно данных для аналитики.” and “Начать прогулку”, using the canonical
  start flow; an existing active Walk retains precedence.
- Loading/error/retry are explicit. Period changes must never show stale results as current.
- “Посмотреть прогулки” opens existing History, optionally with initial intent. Period is
  deliberately not transferred; show “История за всё время” so the destination is honest.
- Back returns to the proper sub-screen with keyboard focus restored. Navigation never starts,
  pauses, completes, records an outcome, processes a capture, or consumes Reentry implicitly.
- Desktop: compact cards; mobile 360/390/430 px: one/two KPI columns, 44px period controls,
  no horizontal overflow, bounded 30-column bars with sparse visible labels and accessible
  date/count facts, content clear of sticky header and bottom navigation.
- Signed tension delta is not interpreted as universally positive/negative by color.

## Acceptance and evidence

TDD covers completed-only selection, count/time/average/days, exact 7/30 boundaries, all intents,
legacy intent, each delta and sample, missing snapshots, valid zeros, impacts, text/capture
counts, empty state and sample thresholds 1/2/3/7/8. Add old/new statistics parity, pause-aware
duration, read failures, immutable persisted records/version/Reentry and safe History navigation.

Browser coverage: desktop 30→7, deltas, modes, History; empty and low-data; mobile 360–430;
focus/touch/overflow and console. At least four screenshots: desktop, 7-day, low-data, mobile.
Run targeted Walk/History/Routine/Decision/Capture tests, typecheck, lint, all Vitest, alpha,
Playwright, build, formatting and both working-tree/staged diff checks. Keep video disabled.

Final report uses the user's 13 WALK-12 headings and explicitly states scope and remaining QA.
Stop after the report; no WALK-13 or Git-write operation.
