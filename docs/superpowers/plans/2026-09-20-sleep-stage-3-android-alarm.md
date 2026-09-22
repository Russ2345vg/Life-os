# Sleep Stage 3 Android Alarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить расписание сна LifeOS к системному Android-будильнику, честно показывать готовность разрешений и подтвердить сигнал на подключённом телефоне.

**Architecture:** `SleepScheduleService` сохраняет доменное расписание и передаёт ближайшее разрешённое событие через application-порт. Tauri-адаптер вызывает Android-плагин; плагин использует `AlarmManager.setAlarmClock`, device-protected preferences, boot/time receivers и foreground media service. Browser/desktop используют неподдерживаемый адаптер и никогда не подтверждают постановку на телефон.

**Tech Stack:** TypeScript, React, Tauri 2, Rust mobile plugin bridge, Kotlin/Android AlarmManager, Vitest, JUnit 4.

**Spec:** `LifeOS_V2_Сон_и_подъём_Задание_Codex.docx`, этап 3.

## Global Constraints

- Реализуется только этап 3; QR, NFC, emergency-stop и утренний сценарий не входят в патч.
- Бизнес-состояние остаётся в `SleepScheduleState`; Android хранит только нативную конфигурацию и подтверждение постановки.
- Полный `test:e2e`, `verify:full`, `npm run verify` и общий тестовый прогон не запускаются.
- На desktop нельзя показывать будильник установленным без подтверждения Android.
- На Android 12+ точная постановка требует проверки `canScheduleExactAlarms()`; на Android 13+ отдельно проверяются уведомления; на Android 14+ — полноэкранный показ.

## Review Focus

- Смена времени или отключение расписания отменяет старый `PendingIntent` до постановки нового.
- Одноразовый пропуск не возвращается после перезагрузки и не отключает последующие дни.
- Повторная доставка одного broadcast не запускает второй сигнал.
- Отозванное разрешение даёт явный статус и переход в нужный системный экран.
- Desktop и browser возвращают `UNAVAILABLE`, а не локальное ложное подтверждение.

---

### Task 1: Application alarm contract and reconciliation

**Files:**

- Create: `src/application/sleep/WakeAlarmGateway.ts`
- Modify: `src/application/sleep/SleepScheduleService.ts`
- Test: `src/application/sleep/SleepScheduleService.test.ts`

**Interfaces:**

- Consumes: `SleepScheduleState`, будущие `WakeOccurrence`, настройки звука.
- Produces: `WakeAlarmGateway.reconcile`, `status`, `scheduleTest`, `openSettings`, `listSounds`; `SleepScheduleService.syncAlarm`.

- [ ] Написать тесты, которые требуют автоматической постановки ближайшего события, отмены старого после изменения/disable и выбора следующего после skip.
- [ ] Запустить `npm run test:target -- src/application/sleep/SleepScheduleService.test.ts` и подтвердить RED.
- [ ] Добавить порт, горизонт событий и reconciliation после разрешённых команд.
- [ ] Повторить targeted test до GREEN.

### Task 2: Tauri adapter and honest UI state

**Files:**

- Create: `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.ts`
- Test: `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.test.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/presentation/planner-v2/SleepPreparationPage.tsx`
- Test: `src/presentation/planner-v2/SleepPreparationPage.test.tsx`

**Interfaces:**

- Consumes: Rust commands `android_alarm_*`.
- Produces: normalised Android readiness, next signal, sound list and settings actions.

- [ ] Написать RED-тесты адаптера для Android/desktop и render-тесты статусов.
- [ ] Реализовать адаптер и подключить его в composition root.
- [ ] Встроить статус и действия в существующие блоки экрана без переработки принятого макета.
- [ ] Запустить только два затронутых target-файла до GREEN.

### Task 3: Native Android alarm delivery

**Files:**

- Create: `src-tauri/src/android_alarm.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/gen/android/app/src/main/java/com/lifeos/desktop/LifeOsAlarm*.kt`
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Test: `src-tauri/gen/android/app/src/test/java/com/lifeos/desktop/AlarmScheduleMathTest.kt`

**Interfaces:**

- Consumes: schedule version, occurrence id/cycle date, wake time/zone, selected system sound.
- Produces: exact `setAlarmClock` delivery, lock-screen notification/activity, looping alarm audio, stop action, persisted acknowledgement and recovery receivers.

- [ ] Написать RED JUnit для расчёта следующего локального события и перехода через DST/date boundary.
- [ ] Реализовать scheduler, receiver, foreground ringing service, alarm activity, plugin commands and manifest declarations.
- [ ] Запустить `:app:testDebugUnitTest` для конкретного JUnit-класса и targeted Android compile/build.
- [ ] Установить APK через ADB, предоставить разрешения через штатные Android-механизмы, поставить пробный сигнал, заблокировать экран и отключить сеть.
- [ ] Подтвердить сигнал, остановку, отсутствие старого события после изменения/отмены и собрать `dumpsys alarm`/logcat evidence.
