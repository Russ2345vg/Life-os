package com.lifeos.desktop

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SleepEventSchedulePolicyTest {
  @Test
  fun afterMidnightBedtimeBelongsToTheFollowingCivilDay() {
    val bedtime = SleepEventScheduleMath.bedtimeForCycleDate(
      cycleDate = "2026-09-20",
      bedtime = "01:00",
      wakeTime = "07:00",
      timeZone = "Asia/Chita",
    )

    assertEquals(Instant.parse("2026-09-20T16:00:00Z").toEpochMilli(), bedtime)
  }

  @Test
  fun daylightSavingGapUsesTheZonesResolvedLocalTime() {
    val bedtime = SleepEventScheduleMath.bedtimeForCycleDate(
      cycleDate = "2026-03-28",
      bedtime = "02:30",
      wakeTime = "07:00",
      timeZone = "Europe/Berlin",
    )

    assertEquals(Instant.parse("2026-03-29T01:30:00Z").toEpochMilli(), bedtime)
  }

  @Test
  fun currentRepeatCanBeSuppressedWithoutSuppressingBedtimeOrTheNextCycle() {
    val now = Instant.parse("2026-09-20T12:00:00Z").toEpochMilli()

    val events = SleepEventScheduleMath.nextEvents(
      startingCycleDate = "2026-09-20",
      bedtime = "22:00",
      wakeTime = "07:00",
      timeZone = "Asia/Chita",
      repeatSuppressedForStartingCycle = true,
      nowEpochMillis = now,
    )

    assertEquals("2026-09-21", events.getValue(SleepEventType.REMINDER_15).cycleDate)
    assertEquals("2026-09-20", events.getValue(SleepEventType.BEDTIME).cycleDate)
    assertEquals("2026-09-20", events.getValue(SleepEventType.QUIET_END).cycleDate)
  }

  @Test
  fun expiredEventsAdvanceIndependentlyInsteadOfCreatingAStaleBurst() {
    val now = Instant.parse("2026-09-20T12:10:00Z").toEpochMilli()

    val events = SleepEventScheduleMath.nextEvents(
      startingCycleDate = "2026-09-20",
      bedtime = "22:00",
      wakeTime = "07:00",
      timeZone = "Asia/Chita",
      repeatSuppressedForStartingCycle = false,
      nowEpochMillis = now,
    )

    assertEquals("2026-09-21", events.getValue(SleepEventType.REMINDER_60).cycleDate)
    assertEquals("2026-09-20", events.getValue(SleepEventType.REMINDER_15).cycleDate)
    assertEquals("2026-09-20", events.getValue(SleepEventType.BEDTIME).cycleDate)
    assertTrue(events.values.all { it.triggerAtEpochMillis > now })
  }

  @Test
  fun lifeOsQuietPolicyAllowsOnlyAlarmsAndStarredCalls() {
    val policy = LifeOsQuietModePolicy.specification()

    assertTrue(policy.allowAlarms)
    assertEquals(QuietCallAudience.STARRED, policy.callAudience)
    assertFalse(policy.allowRepeatCallers)
  }

  @Test
  fun missingDndAccessDoesNotDowngradeAnOtherwiseScheduledWakeAlarm() {
    val state = LifeOsAlarmStatusPolicy.state(
      ringing = false,
      hasAlarmCapabilityIssues = false,
      error = null,
      enabled = true,
      hasScheduledOccurrence = true,
    )

    assertEquals("SCHEDULED", state)
  }
}
