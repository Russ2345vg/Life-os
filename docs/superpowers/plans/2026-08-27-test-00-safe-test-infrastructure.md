# TEST-00 Safe Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. LifeOS rules require the primary agent to remain the only file author; reviewers stay read-only.

**Goal:** Make every canonical LifeOS test and verification command one-shot, bounded, diagnostic, and safe on Windows without changing product behavior.

**Architecture:** A dependency-free Node process runner owns deadlines, diagnostics, signals, and recursive cleanup of only its own child processes. Thin Vitest, Playwright, and verify entry points share that runner, while separate Vitest configs keep targeted, fast, full, infrastructure, and alpha suites explicit.

**Tech Stack:** Node.js 24 ESM, npm 11, Vitest 4, Playwright 1.62, Vite 8, TypeScript 6, Windows `taskkill` for owned process trees.

**Spec:** `docs/superpowers/specs/2026-08-27-test-00-safe-test-infrastructure-design.md`

## Global Constraints

- Work only in `D:\LifeOS-App`; confirm `git rev-parse --show-toplevel` and `git status --short` before each implementation batch.
- Preserve every pre-existing MOR-00/MOR-01 and user-owned worktree change.
- Do not change product behavior, domain/application contracts, persistence schema, or user data.
- Do not add dependencies or modify `package-lock.json` unless an unexplained existing lockfile drift is discovered and reported rather than overwritten.
- Do not kill a process discovered through a port lookup. Terminate only a `ChildProcess.pid` created by the current runner.
- Keep Playwright retries at `0`; do not suppress test failures or convert timeout into success.
- Do not use bare `vitest`, `npx vitest`, or an interactive Playwright mode for verification.
- Do not commit or push. End every task with a diff/status checkpoint instead of a Git commit.
- All new behavior follows RED → GREEN → REFACTOR; record the expected failure before implementation.

---

## File Structure

- `scripts/test-infrastructure/process-runner.mjs` — start, observe, bound, diagnose, and terminate one owned process tree.
- `scripts/test-infrastructure/process-runner.test.mjs` — real child-process tests for success, exit propagation, timeout, signals, and Windows descendant cleanup.
- `scripts/test-infrastructure/fixtures/exit.mjs` — deterministic child that exits with a requested code and optional output.
- `scripts/test-infrastructure/fixtures/hang.mjs` — deterministic child that remains alive until terminated.
- `scripts/test-infrastructure/fixtures/tree-parent.mjs` — parent that starts a descendant TCP server, used to prove recursive cleanup.
- `scripts/test-infrastructure/fixtures/http-server.mjs` — controlled HTTP server used by E2E lifecycle tests.
- `scripts/run-vitest.mjs` — public targeted/fast/full/infra/alpha dispatcher with fixed deadlines.
- `scripts/run-vitest.test.mjs` — dispatcher validation and real CLI exit-code tests.
- `scripts/run-check.mjs` / `scripts/run-check.test.mjs` — bounded direct typecheck, lint, build,
  and format-check commands.
- `vitest.config.ts` — full product unit/integration config including `.test.tsx`, excluding alpha and script self-tests.
- `vitest.infrastructure.config.ts` — Node-only script-infrastructure test config.
- `vitest.alpha.config.ts` — isolated alpha gate config.
- `scripts/test-infrastructure/e2e-lifecycle.mjs` — port ownership, Vite readiness, Playwright deadline, and teardown.
- `scripts/run-playwright-e2e.mjs` — thin CLI for the E2E lifecycle.
- `scripts/run-playwright-e2e.test.mjs` — lifecycle regressions using real fixture processes.
- `scripts/verify.mjs` — sequential canonical gate with per-stage and overall deadlines.
- `scripts/verify.test.mjs` — real fixture stages proving stop-on-failure, timeout, summary, and exit codes.
- `package.json` — stable public commands only.
- `playwright.config.ts` / `playwright.managed.config.ts` — test/global timeouts and server ownership separation.
- `src/test/alpha/AlphaCycleGate.test.ts` — evidence-based local timeout and exception-safe application cleanup.
- Confirmed IndexedDB test helpers — reject `blocked`/`abort` instead of leaving promises pending.
- `AGENTS.md`, `docs/codex/CODEX_WORKFLOW.md`, `docs/codex/TEST_MATRIX.md`, `README.md`, `docs/codex/PROJECT_MAP.md` — one canonical workflow.

---

### Task 1: Bounded owned-process runner

**Files:**

- Create: `scripts/test-infrastructure/process-runner.mjs`
- Create: `scripts/test-infrastructure/process-runner.test.mjs`
- Create: `scripts/test-infrastructure/fixtures/exit.mjs`
- Create: `scripts/test-infrastructure/fixtures/hang.mjs`
- Create: `scripts/test-infrastructure/fixtures/tree-parent.mjs`
- Create: `scripts/test-infrastructure/fixtures/http-server.mjs`
- Create: `vitest.infrastructure.config.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**

- Produces `runBoundedProcess(input)` where `input` has `stage`, `command`, `args`, `cwd`, `env`, `timeoutMs`, optional `shutdownTimeoutMs`, and optional `writeLine`.
- Produces result `{ stage, commandLine, durationMs, exitCode, signal, timedOut }`.
- Produces `terminateOwnedProcessTree(child, options)`; it accepts only a spawned `ChildProcess`, never a port or arbitrary PID.
- Windows cleanup invokes `taskkill /PID <child.pid> /T /F`; non-Windows cleanup targets the owned detached process group, first with `SIGTERM`, then bounded `SIGKILL` escalation.
- Consumers: Vitest dispatcher, E2E lifecycle, verify orchestrator.

- [ ] **Step 1: Write real child fixtures**

`exit.mjs` must emit a literal marker and return the requested code:

```js
import process from 'node:process';

const exitCode = Number(process.argv[2] ?? '0');
process.stdout.write(`fixture-exit:${exitCode}\n`);
process.exitCode = exitCode;
```

`hang.mjs` must keep one real handle alive without input:

```js
import process from 'node:process';
import { setInterval } from 'node:timers';

process.stdout.write('fixture-hang:ready\n');
setInterval(() => {}, 1_000);
```

`tree-parent.mjs` must spawn `http-server.mjs` as a descendant, forward the chosen port, print `fixture-tree:ready`, and keep the parent alive. The test will assert the descendant port closes after the runner times out.

- [ ] **Step 2: Write failing process-runner tests**

Cover observable behavior with real children:

```js
test('returns the child exit code and stage duration', async () => {
  const lines = [];
  const result = await runBoundedProcess({
    stage: 'exit-seven',
    command: process.execPath,
    args: [exitFixturePath, '7'],
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 2_000,
    writeLine: (line) => lines.push(line),
  });

  expect(result.exitCode).toBe(7);
  expect(result.timedOut).toBe(false);
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
  expect(lines.join('\n')).toContain('[exit-seven] FAIL');
});

test('times out a hung child with code 124 and diagnostics', async () => {
  const lines = [];
  const result = await runBoundedProcess({
    stage: 'hung-stage',
    command: process.execPath,
    args: [hangFixturePath],
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 250,
    shutdownTimeoutMs: 2_000,
    writeLine: (line) => lines.push(line),
  });

  expect(result).toMatchObject({ exitCode: 124, timedOut: true });
  expect(lines.join('\n')).toContain('[hung-stage] TIMEOUT');
  expect(lines.join('\n')).toContain('250ms');
});
```

Add a `win32`-only test that selects a free port, runs `tree-parent.mjs`, lets the deadline fire, and then proves a new server can bind the same port. The mutation it catches is replacing `/T` tree cleanup with direct-parent-only `child.kill()`.

- [ ] **Step 3: Run RED and capture the expected module-not-found failure**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run scripts/test-infrastructure/process-runner.test.mjs --config vitest.infrastructure.config.ts --reporter=verbose
```

Expected: exit `1`; import of `process-runner.mjs` fails because implementation does not exist.

- [ ] **Step 4: Implement the minimal process runner**

Use `spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'inherit', 'inherit'], detached: process.platform !== 'win32' })`. Attach both `error` and `exit` listeners before waiting. Use one settled promise so spawn error, normal exit, timeout, and signal cannot complete twice. Clear every timer in `finally`.

Timeout diagnostics must be generated from literal state owned by the runner:

```js
return {
  stage,
  commandLine: [command, ...args].join(' '),
  durationMs: performance.now() - startedAt,
  exitCode: 124,
  signal: null,
  timedOut: true,
};
```

Do not call `process.exit()` inside the reusable module.

- [ ] **Step 5: Run GREEN twice, including descendant cleanup**

Run the Task 1 command twice. Expected both times: all tests pass, no residual fixture port, no Vitest open-handle warning.

- [ ] **Step 6: Check scope without committing**

Run `git diff --check` and `git status --short`. Confirm only Task 1 files changed in this batch and `package-lock.json` did not change.

---

### Task 2: Explicit targeted, fast, full, infrastructure, and alpha Vitest commands

**Files:**

- Create: `scripts/run-vitest.mjs`
- Create: `scripts/run-vitest.test.mjs`
- Create: `vitest.alpha.config.ts`
- Modify: `vitest.config.ts`
- Modify: `vitest.infrastructure.config.ts`
- Modify: `tsconfig.node.json`
- Modify: `package.json`

**Interfaces:**

- Produces `resolveVitestInvocation(mode, selectors)` for modes `target`, `fast`, `full`, `infra`, and `alpha`.
- CLI is `node scripts/run-vitest.mjs <mode> [...selectors]`.
- `target` requires at least one non-option selector ending in `.test.ts` or `.test.tsx`; options may follow selectors.
- All modes invoke local `node_modules/vitest/vitest.mjs` with the `run` subcommand.
- Fixed deadlines: target `120_000`, fast `180_000`, full `300_000`, infra `120_000`, alpha `60_000` milliseconds.

- [ ] **Step 1: Write failing dispatcher tests**

Required behavior:

```js
test('refuses an empty targeted invocation before starting Vitest', () => {
  expect(() => resolveVitestInvocation('target', [])).toThrow(
    'test:target requires at least one .test.ts or .test.tsx selector.',
  );
});

test('every invocation explicitly uses Vitest run', () => {
  for (const [mode, selectors] of [
    ['target', ['src/domain/shared/EntityId.test.ts']],
    ['fast', []],
    ['full', []],
    ['infra', []],
    ['alpha', []],
  ]) {
    expect(resolveVitestInvocation(mode, selectors).args[0]).toBe('run');
  }
});
```

Add a real CLI test that runs `node scripts/run-vitest.mjs target` and asserts exit `1`, the literal selector diagnostic, and completion within two seconds. Add a targeted `.test.tsx` invocation using `src/presentation/components/SphereReference.test.tsx`; this catches the existing include gap.

- [ ] **Step 2: Run RED**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run scripts/run-vitest.test.mjs --config vitest.infrastructure.config.ts --reporter=verbose
```

Expected: exit `1`; dispatcher module is missing.

- [ ] **Step 3: Implement configs and dispatcher**

`vitest.config.ts` must include product tests and exclude alpha:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/test/alpha/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`vitest.alpha.config.ts` includes only `src/test/alpha/AlphaCycleGate.test.ts` with the same setup. `vitest.infrastructure.config.ts` includes `scripts/**/*.test.mjs` with Node environment and no IndexedDB setup.

The dispatcher maps modes to literal arguments and delegates execution to `runBoundedProcess`. On validation failure it prints one line and sets `process.exitCode = 1`; it never falls through to the full suite.

Update package scripts to:

```json
"test:target": "node scripts/run-vitest.mjs target",
"test:fast": "node scripts/run-vitest.mjs fast",
"test": "node scripts/run-vitest.mjs full",
"test:infra": "node scripts/run-vitest.mjs infra",
"test:alpha": "node scripts/run-vitest.mjs alpha"
```

- [ ] **Step 4: Run GREEN and targeted characterization**

Run:

```powershell
npm run test:infra -- scripts/run-vitest.test.mjs --reporter=verbose
npm run test:target -- src/presentation/components/SphereReference.test.tsx --reporter=verbose
npm run test:fast -- --reporter=verbose
```

Expected: each command exits once with code `0`; `.test.tsx` is discovered; no command enters watch.

- [ ] **Step 5: Check package/config scope without committing**

Run `npm run typecheck`, `git diff --check`, and inspect `git diff -- package.json vitest*.ts scripts/run-vitest* tsconfig.node.json`.

---

### Task 3: Managed Playwright/Vite lifecycle with bounded Windows teardown

**Files:**

- Create: `scripts/test-infrastructure/e2e-lifecycle.mjs`
- Modify: `scripts/test-infrastructure/fixtures/http-server.mjs`
- Modify: `scripts/run-playwright-e2e.mjs`
- Modify: `scripts/run-playwright-e2e.test.mjs`
- Modify: `playwright.config.ts`
- Modify: `playwright.managed.config.ts`
- Modify: `package.json`

**Interfaces:**

- Produces `validatePlaywrightArguments(args)` and `runManagedE2e(options)`.
- `options` supplies host, port, Vite command, Playwright command, arguments, startup/playwright/shutdown deadlines, and `writeLine`.
- `runManagedE2e` returns `{ stage, exitCode, durationMs, timedOut }`, where `stage` is one of `validation`, `port-check`, `vite-startup`, `playwright`, or `teardown`.
- The lifecycle test file defines real helpers `startFixtureServer(port)`, `requestText(port)`, `expectPortAvailable(port)`, and `fixtureOptions(overrides)` around the controlled `http-server.mjs` fixture; these helpers do not mock process or socket behavior.
- `run-playwright-e2e.mjs --list` and the full command use the same lifecycle and managed config.
- Disallowed arguments include config overrides, `--ui`, `--debug`, `--headed`, and `--ui-host`; rejection happens before port probing or spawning.
- Production deadlines: Vite startup `60_000`, list `120_000`, full Playwright `1_200_000`, teardown `10_000` milliseconds. `playwright.config.ts` uses `globalTimeout: 1_200_000`, retries `0`, workers `1`, and trace `retain-on-failure`.

- [ ] **Step 1: Replace the current lifecycle tests with deterministic failing regressions**

Keep the real occupied-port owner test and add:

```js
test('refuses an occupied port without stopping its owner', async () => {
  const owner = await startFixtureServer(port);
  try {
    const result = await runManagedE2e(fixtureOptions({ port }));
    expect(result.exitCode).toBe(1);
    expect(result.stage).toBe('port-check');
    expect(await requestText(port)).toBe('fixture-owner');
  } finally {
    await owner.close();
  }
});

test('times out Playwright, kills its owned descendants, and releases Vite port', async () => {
  const result = await runManagedE2e(
    fixtureOptions({ port, playwrightFixture: treeParentFixture, playwrightTimeoutMs: 300 }),
  );

  expect(result).toMatchObject({ exitCode: 124, stage: 'playwright' });
  await expectPortAvailable(port);
  await expectPortAvailable(descendantPort);
});
```

Also cover successful list teardown, Playwright exit `7`, Vite spawn error, SIGINT-equivalent abort, repeated teardown, and table-driven rejection of `--config`, `-c`, `--ui`, `--debug`, `--headed`, and `--ui-host`.

- [ ] **Step 2: Run RED against the current WIP runner**

Run:

```powershell
npm run test:infra -- scripts/run-playwright-e2e.test.mjs --reporter=verbose
```

Expected: new timeout/tree/signal/interactive tests fail because the current runner waits without an outer deadline, kills direct children only, and forwards interactive flags.

- [ ] **Step 3: Implement one idempotent lifecycle**

Move reusable logic out of the top-level CLI. The lifecycle order is fixed:

```text
validate arguments → port-check → spawn Vite → HTTP readiness → bounded Playwright
→ terminate owned Playwright tree → terminate owned Vite tree → confirm port release
```

Use `try/finally` around every path after the first child starts. Use `runBoundedProcess` for Playwright and the shared owned-tree terminator for Vite. Clear readiness sockets, HTTP requests, and timer branches on settle. Signal handlers request the same cleanup promise; they do not bypass it on a second signal.

The CLI sets only the result code returned by `runManagedE2e`:

```js
const result = await runManagedE2e(productionOptions(process.argv.slice(2)));
process.exitCode = result.exitCode;
```

- [ ] **Step 4: Run GREEN repeatedly and verify port ownership**

Run the Task 3 infrastructure test command twice, then:

```powershell
npm run test:e2e:list
```

Expected: infra tests pass twice; list exits `0`; port 4173 is free afterward. During the occupied-port case, the fixture owner remains reachable until its own test cleanup.

- [ ] **Step 5: Inspect Windows process evidence**

After the tests, use a read-only port/process query to confirm there is no listener created by the test on 4173. Do not terminate anything found by the query. Run `git diff --check` and inspect only Task 3 files.

---

### Task 4: Alpha and IndexedDB non-settling paths

**Files:**

- Modify: `src/test/alpha/AlphaCycleGate.test.ts`
- Modify: `src/infrastructure/persistence/TomorrowPlanPersistence.test.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`
- Modify: `src/infrastructure/persistence/IndexedDbRoutineOccurrenceExecutionRepository.test.ts`
- Modify: `tests/e2e/morning-center.acceptance.spec.ts`

**Interfaces:**

- Alpha gate remains the same 20-day scenario and changes no product contract.
- Alpha test receives a local `30_000` millisecond timeout; the process wrapper remains `60_000`.
- Every touched IndexedDB promise rejects on `error`, `abort`, or `blocked` when that event can prevent settlement.
- Every application/database created by the alpha scenario is tracked and closed from `finally`, including failure paths.

- [ ] **Step 1: Capture the existing alpha RED evidence**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run --config vitest.alpha.config.ts --reporter=verbose
```

Expected before the local timeout change: the 20-day test can exceed Vitest's default 5 seconds and exit `1` with timeout. Record the actual duration; do not use a global `--testTimeout` override as the fix.

- [ ] **Step 2: Make alpha cleanup exception-safe and set only the local timeout**

Track created applications in a `Set<{ close(): void }>`; remove them after an intentional close and close any remaining instances in `finally`. Preserve `fetchSpy.mockRestore()` in the same `finally`. Keep the existing test name, body, and assertions unchanged; replace its final line `  });` with the exact local-timeout form `  }, 30_000);`.

- [ ] **Step 3: Add settlement handlers only to confirmed helpers**

For delete requests, reject `blocked` explicitly:

```ts
request.addEventListener('blocked', () => {
  reject(new Error('IndexedDB deletion was blocked by an open connection.'));
});
```

For transaction promises currently listening only to `complete` and `error`, add `abort` rejection using `transaction.error ?? new Error('IndexedDB transaction aborted.')`. In the E2E seeding callback, close the opened database in a `finally` path inside `page.evaluate`.

- [ ] **Step 4: Run GREEN and neighboring persistence tests**

Run:

```powershell
npm run test:alpha -- --reporter=verbose
npm run test:target -- src/infrastructure/persistence/TomorrowPlanPersistence.test.ts --reporter=verbose
npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts --reporter=verbose
npm run test:target -- src/infrastructure/persistence/IndexedDbRoutineOccurrenceExecutionRepository.test.ts --reporter=verbose
```

Expected: all exit `0`; alpha completes within the local 30-second and process 60-second bounds.

- [ ] **Step 5: Confirm no product diff**

Inspect `git diff -- src/test/alpha src/infrastructure/persistence tests/e2e/morning-center.acceptance.spec.ts`. Only test code and test helpers may change.

---

### Task 5: Sequential canonical verify orchestrator

**Files:**

- Create: `scripts/verify.mjs`
- Create: `scripts/verify.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces `runVerification({ stages, overallTimeoutMs, writeLine })`.
- Each stage is `{ name, command, args, timeoutMs }` and executes through `runBoundedProcess`.
- Production stages use `process.execPath` plus `process.env.npm_execpath` to invoke existing npm scripts without `.cmd` shell ambiguity on Windows.
- Production order: typecheck, lint, test, test:infra, test:alpha, test:e2e, build, format:check, Git diff check.
- Per-stage limits: typecheck `180_000`, lint `180_000`, test `300_000`, infra `120_000`, alpha `60_000`, E2E `1_200_000`, build `300_000`, format `180_000`, Git diff `60_000` milliseconds.
- Overall limit: `1_800_000` milliseconds. Remaining overall time caps the next stage deadline.
- Stops on first failure or timeout, returns that code, and prints a table for stages already attempted.
- The test file defines `fixtureStage(name, exitCode)` and `hungFixtureStage(name)` as literal stage objects that invoke `exit.mjs` and `hang.mjs` through `process.execPath`; they exercise the real process runner rather than a mocked stage executor.

- [ ] **Step 1: Write failing orchestrator tests with real fixture stages**

Required cases:

```js
test('stops after the first failing stage and preserves its exit code', async () => {
  const lines = [];
  const result = await runVerification({
    stages: [fixtureStage('first', 0), fixtureStage('second', 7), fixtureStage('never', 0)],
    overallTimeoutMs: 5_000,
    writeLine: (line) => lines.push(line),
  });

  expect(result.exitCode).toBe(7);
  expect(result.stages.map((stage) => stage.name)).toEqual(['first', 'second']);
  expect(lines.join('\n')).toContain('second');
  expect(lines.join('\n')).not.toContain('never |');
});

test('reports stage, command, and elapsed time when the overall deadline expires', async () => {
  const lines = [];
  const result = await runVerification({
    stages: [hungFixtureStage('slow-e2e')],
    overallTimeoutMs: 300,
    writeLine: (line) => lines.push(line),
  });

  expect(result.exitCode).toBe(124);
  expect(lines.join('\n')).toContain('slow-e2e');
  expect(lines.join('\n')).toContain('TIMEOUT');
  expect(lines.join('\n')).toContain(process.execPath);
});
```

Add success-summary and invalid `npm_execpath` tests. The production change caught is a shell chain that loses stage identity or continues after a failure.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm run test:infra -- scripts/verify.test.mjs --reporter=verbose
```

Expected: exit `1`; `verify.mjs` does not yet exist.

- [ ] **Step 3: Implement the orchestrator and package entry**

The summary uses stable columns without hiding raw child output:

```text
Stage | Mode | Duration | Exit | Result
typecheck | one-shot | 12.34s | 0 | PASS
test | one-shot | 84.12s | 0 | PASS
```

Set `package.json` to `"verify": "node scripts/verify.mjs"`. Do not embed `&&`, PowerShell, Bash, retry, or port-killing commands in `verify`.

- [ ] **Step 4: Run GREEN and a bounded dry integration**

Run the Task 5 test command twice. Then invoke `npm run verify` only after Tasks 6 and 7 have made all canonical checks ready; do not run the expensive full gate yet.

- [ ] **Step 5: Check exit-code scope without committing**

Run `git diff --check` and inspect `git diff -- package.json scripts/verify.mjs scripts/verify.test.mjs`.

---

### Task 6: Canonical Codex and project instructions

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/codex/CODEX_WORKFLOW.md`
- Modify: `docs/codex/TEST_MATRIX.md`
- Modify: `README.md`
- Modify: `docs/codex/PROJECT_MAP.md`
- Modify: `docs/codex/KNOWN_ISSUES.md` only if it still presents the old 147/1166 run as current rather than historical.

**Interfaces:**

- Documentation has one command map derived from `package.json`.
- Required order is targeted → optional fast → typecheck/lint → full/infra/alpha → E2E → build → format/Git.
- `npm run verify` is the only full sequential gate.
- Explicit prohibition: bare `vitest`, `npx vitest`, watch mode, Playwright UI/debug, and silent waiting beyond a command's printed deadline.
- Hang response: record last stage/output and elapsed time; allow the runner to terminate its owned tree; treat timeout as unresolved failure; rerun only the smallest targeted case with verbose output.

- [ ] **Step 1: Update the command matrix from implemented scripts**

Document every command with mode and expected scope. Replace the stale current baseline with the fresh measured result, clearly timestamped. Keep older 147/1166 evidence only when labelled historical.

- [ ] **Step 2: Add the mandatory agent workflow to AGENTS and CODEX_WORKFLOW**

Use this exact semantic order:

```text
test:target → test:fast when shared layers changed → typecheck + lint
→ test + test:infra + test:alpha → test:e2e → build → format/diff hygiene
```

State that full tests run before patch completion, not after every edit, and that Codex must never wait silently past the printed deadline.

- [ ] **Step 3: Align README and PROJECT_MAP**

Use `npm ci` for reproducible setup. Include `test:e2e`, `verify`, and the link to `TEST_MATRIX.md`. Do not expand product documentation.

- [ ] **Step 4: Validate documentation mechanically**

Run:

```powershell
npm run format:check -- AGENTS.md docs/codex README.md
git diff --check
```

Then manually compare every documented command with `npm run` output. Do not add a brittle source-grep test for prose.

- [ ] **Step 5: Review documentation diff without committing**

Confirm it contains no MOR-01 instructions and no claim of a passing full gate before Task 7 evidence exists.

---

### Task 7: Targeted verification, full gate, and final independent review

**Files:**

- Modify only files required by defects revealed by the checks above; return to the owning task's RED/GREEN loop for every correction.
- Do not create generated reports, screenshots, caches, or lockfile changes as tracked files.

**Interfaces:**

- Produces fresh evidence table `Команда | Назначение | Режим | Время | Результат`.
- Produces exact final verdict `готово`, `не готово`, or `не подтверждено` under the LifeOS quality gate.

- [ ] **Step 1: Run targeted infrastructure checks first**

Run and record duration/exit code:

```powershell
npm run test:infra -- scripts/test-infrastructure/process-runner.test.mjs --reporter=verbose
npm run test:infra -- scripts/run-vitest.test.mjs --reporter=verbose
npm run test:infra -- scripts/run-playwright-e2e.test.mjs --reporter=verbose
npm run test:infra -- scripts/verify.test.mjs --reporter=verbose
npm run test:target -- src/presentation/components/SphereReference.test.tsx --reporter=verbose
```

- [ ] **Step 2: Run static and neighboring checks**

Run and record:

```powershell
npm run typecheck
npm run lint
npm run test:alpha -- --reporter=verbose
npm run test:e2e:list
```

- [ ] **Step 3: Run the single canonical full gate once**

Run:

```powershell
npm run verify
```

Do not wrap it in a second ad hoc timeout; its own stage and overall deadlines are the behavior under test. Maintain commentary updates at least once per minute using bounded tool yields. A timeout is a failed/unresolved check.

- [ ] **Step 4: If a gate fails, localize instead of retrying blindly**

Record stage, command, elapsed time, last output, and exit code. Run only the smallest corresponding targeted command. Add or adjust a regression only for a confirmed cause, then repeat the affected targeted check. Re-run the full `verify` once after the patch is stable.

- [ ] **Step 5: Run final Git hygiene and scope audit**

Run:

```powershell
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Read the complete final diff for architecture, Windows safety, product scope, user data, lockfile drift, and accidental MOR changes. Distinguish pre-existing user changes from TEST-00 files.

- [ ] **Step 6: Request read-only independent review**

Dispatch the LifeOS `test-reviewer` for coverage/flakiness and `final-reviewer` for requirements, safety, and gate evidence. Give them the spec, this plan, final diff, status, and fresh command table. Fix every valid Critical/Important finding through the owning TDD task and rerun affected checks.

- [ ] **Step 7: Deliver the final report without commit or push**

Include:

- the required command table;
- confirmed prior causes and remaining hypotheses;
- exact safeguards preventing infinite waits;
- commands Codex must use and commands it must avoid;
- test/typecheck/lint/E2E/build results;
- unresolved limitations or manual QA;
- statement that product functionality, MOR-01, commit, and push were not performed.
