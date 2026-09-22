package com.lifeos.desktop

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class AlarmScheduleMathTest {
  @Test
  fun rejectsRepeatedDeliveryOfTheSameOccurrence() {
    assertEquals(
      false,
      AlarmDeliveryPolicy.shouldAccept(
        previousDeliveryKey = "wake-2026-09-20",
        occurrenceId = "wake-2026-09-20",
        isTest = false,
      ),
    )
  }

  @Test
  fun keepsTestAndRecurringDeliveriesInSeparateNamespaces() {
    assertEquals(
      true,
      AlarmDeliveryPolicy.shouldAccept(
        previousDeliveryKey = "wake-2026-09-20",
        occurrenceId = "wake-2026-09-20",
        isTest = true,
      ),
    )
  }

  @Test
  fun cycleDateSchedulesWakeOnTheFollowingLocalMorning() {
    val trigger = AlarmScheduleMath.triggerForCycleDate(
      cycleDate = "2026-09-20",
      wakeTime = "07:00",
      timeZone = "Asia/Chita",
    )

    assertEquals(Instant.parse("2026-09-20T22:00:00Z").toEpochMilli(), trigger)
  }

  @Test
  fun nonexistentDstTimeMovesToTheFirstExistingLocalTime() {
    val trigger = AlarmScheduleMath.triggerForCycleDate(
      cycleDate = "2026-03-28",
      wakeTime = "02:30",
      timeZone = "Europe/Berlin",
    )

    assertEquals(Instant.parse("2026-03-29T01:30:00Z").toEpochMilli(), trigger)
  }

  @Test
  fun advancesPersistedCycleUntilItsTriggerIsInTheFuture() {
    val result = AlarmScheduleMath.firstFutureCycle(
      cycleDate = "2026-09-20",
      wakeTime = "07:00",
      timeZone = "Asia/Chita",
      nowEpochMillis = Instant.parse("2026-09-21T00:00:00Z").toEpochMilli(),
    )

    assertEquals("2026-09-21", result)
  }
}
