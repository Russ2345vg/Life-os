package com.lifeos.desktop

data class WalkReminderDay(val cityDate: String, val sunsetAt: Long?, val walkStartAt: Long?)

/** Consumes the shared solar calendar; never calculates sunset on Android. */
object WalkReminderSchedulePolicy {
  fun next(days: List<WalkReminderDay>, now: Long, delivered: Set<String>): WalkReminderDay? =
    days.firstOrNull { it.walkStartAt != null && it.walkStartAt > now && it.cityDate !in delivered }

  fun canDispatch(day: WalkReminderDay, now: Long, requestedRevision: Long,
    currentRevision: Long, enabled: Boolean, delivered: Set<String>): Boolean {
    val at = day.walkStartAt ?: return false
    return enabled && requestedRevision == currentRevision && day.cityDate !in delivered &&
      now >= at && now - at <= 300_000L
  }
}
