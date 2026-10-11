package com.lifeos.desktop

import org.junit.Assert.*
import org.junit.Test

class WalkReminderSchedulePolicyTest {
  private val day = WalkReminderDay("2026-10-11", 1791711060000L, 1791710160000L)
  @Test fun skipsPastNullAndDeliveredDates() {
    val list = listOf(day, WalkReminderDay("2026-10-12", null, null), day.copy(cityDate = "2026-10-13", sunsetAt = day.sunsetAt!! + 172800000L, walkStartAt = day.walkStartAt!! + 172800000L))
    assertEquals("2026-10-13", WalkReminderSchedulePolicy.next(list, day.walkStartAt!!, setOf("2026-10-11"))?.cityDate)
    assertNull(WalkReminderSchedulePolicy.next(list, Long.MAX_VALUE, emptySet()))
  }
  @Test fun rejectsStaleDisabledDuplicateAndOverdueDispatch() {
    val now = day.walkStartAt!!
    assertTrue(WalkReminderSchedulePolicy.canDispatch(day, now, 2, 2, true, emptySet()))
    assertFalse(WalkReminderSchedulePolicy.canDispatch(day, now, 1, 2, true, emptySet()))
    assertFalse(WalkReminderSchedulePolicy.canDispatch(day, now, 2, 2, false, emptySet()))
    assertFalse(WalkReminderSchedulePolicy.canDispatch(day, now, 2, 2, true, setOf(day.cityDate)))
    assertFalse(WalkReminderSchedulePolicy.canDispatch(day, now + 300001L, 2, 2, true, emptySet()))
    assertFalse(WalkReminderSchedulePolicy.canDispatch(day, now - 1, 2, 2, true, emptySet()))
  }
}
