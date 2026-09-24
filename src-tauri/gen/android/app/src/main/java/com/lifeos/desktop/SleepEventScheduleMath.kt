package com.lifeos.desktop

enum class SleepEventType {
  REMINDER_60,
  REMINDER_15,
  BEDTIME,
  QUIET_END,
}

data class ScheduledSleepEvent(
  val type: SleepEventType,
  val cycleDate: String,
  val triggerAtEpochMillis: Long,
)

object SleepEventScheduleMath {
  private const val MINUTE_MILLIS = 60_000L

  fun bedtimeForCycleDate(
    cycleDate: String,
    bedtime: String,
    wakeTime: String,
    timeZone: String,
  ): Long {
    val bedtimeMinutes = minutesOfDay(bedtime)
    val wakeMinutes = minutesOfDay(wakeTime)
    return AlarmScheduleMath.triggerForLocalTime(
      cycleDate = cycleDate,
      localTime = bedtime,
      timeZone = timeZone,
      dayOffset = if (bedtimeMinutes < wakeMinutes) 1 else 0,
    )
  }

  fun nextEvents(
    startingCycleDate: String,
    bedtime: String,
    wakeTime: String,
    timeZone: String,
    repeatSuppressedForStartingCycle: Boolean,
    nowEpochMillis: Long,
  ): Map<SleepEventType, ScheduledSleepEvent> = SleepEventType.entries.associateWith { type ->
    var cycleDate = startingCycleDate
    var isStartingCycle = true
    while (true) {
      if (
        type == SleepEventType.REMINDER_15 &&
        isStartingCycle &&
        repeatSuppressedForStartingCycle
      ) {
        cycleDate = AlarmScheduleMath.nextCycleDate(cycleDate, timeZone)
        isStartingCycle = false
        continue
      }
      val trigger = triggerFor(type, cycleDate, bedtime, wakeTime, timeZone)
      if (trigger > nowEpochMillis) return@associateWith ScheduledSleepEvent(type, cycleDate, trigger)
      cycleDate = AlarmScheduleMath.nextCycleDate(cycleDate, timeZone)
      isStartingCycle = false
    }
    @Suppress("UNREACHABLE_CODE")
    error("Unable to calculate a future sleep event.")
  }

  private fun triggerFor(
    type: SleepEventType,
    cycleDate: String,
    bedtime: String,
    wakeTime: String,
    timeZone: String,
  ): Long {
    val bedtimeAt = bedtimeForCycleDate(cycleDate, bedtime, wakeTime, timeZone)
    return when (type) {
      SleepEventType.REMINDER_60 -> bedtimeAt - 60 * MINUTE_MILLIS
      SleepEventType.REMINDER_15 -> bedtimeAt - 15 * MINUTE_MILLIS
      SleepEventType.BEDTIME -> bedtimeAt
      SleepEventType.QUIET_END -> AlarmScheduleMath.triggerForCycleDate(
        cycleDate,
        wakeTime,
        timeZone,
      )
    }
  }

  private fun minutesOfDay(value: String): Int {
    val match = requireNotNull(Regex("^(\\d{2}):(\\d{2})$").matchEntire(value)) {
      "Invalid local time."
    }
    val hour = match.groupValues[1].toInt()
    val minute = match.groupValues[2].toInt()
    require(hour in 0..23 && minute in 0..59) { "Invalid local time." }
    return hour * 60 + minute
  }
}

object LifeOsAlarmStatusPolicy {
  fun state(
    ringing: Boolean,
    hasAlarmCapabilityIssues: Boolean,
    error: String?,
    enabled: Boolean,
    hasScheduledOccurrence: Boolean,
  ): String = when {
    ringing -> "RINGING"
    hasAlarmCapabilityIssues -> "PERMISSION_REQUIRED"
    error != null -> "ERROR"
    enabled && hasScheduledOccurrence -> "SCHEDULED"
    else -> "READY"
  }
}
