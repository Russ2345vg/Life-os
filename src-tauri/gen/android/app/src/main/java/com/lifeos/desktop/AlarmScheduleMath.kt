package com.lifeos.desktop

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

object AlarmScheduleMath {
  private val cycleDatePattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")
  private val timePattern = Regex("^(\\d{2}):(\\d{2})$")

  fun triggerForCycleDate(cycleDate: String, wakeTime: String, timeZone: String): Long {
    require(cycleDatePattern.matches(cycleDate)) { "Invalid cycle date." }
    val time = requireNotNull(timePattern.matchEntire(wakeTime)) { "Invalid wake time." }
    val hour = time.groupValues[1].toInt()
    val minute = time.groupValues[2].toInt()
    require(hour in 0..23 && minute in 0..59) { "Invalid wake time." }
    val zone = TimeZone.getTimeZone(timeZone)
    require(zone.id == timeZone || timeZone == "GMT") { "Unknown time zone." }
    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
      isLenient = false
      this.timeZone = zone
    }
    val cycle = requireNotNull(parser.parse(cycleDate)) { "Invalid cycle date." }
    return Calendar.getInstance(zone).apply {
      isLenient = true
      this.time = cycle
      add(Calendar.DAY_OF_MONTH, 1)
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
  }

  fun firstFutureCycle(
    cycleDate: String,
    wakeTime: String,
    timeZone: String,
    nowEpochMillis: Long,
  ): String {
    var candidate = cycleDate
    while (triggerForCycleDate(candidate, wakeTime, timeZone) <= nowEpochMillis) {
      candidate = nextCycleDate(candidate, timeZone)
    }
    return candidate
  }

  fun nextCycleDate(cycleDate: String, timeZone: String): String {
    val zone = TimeZone.getTimeZone(timeZone)
    require(zone.id == timeZone || timeZone == "GMT") { "Unknown time zone." }
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
      isLenient = false
      this.timeZone = zone
    }
    val date = requireNotNull(format.parse(cycleDate)) { "Invalid cycle date." }
    return format.format(Calendar.getInstance(zone).apply {
      time = date
      add(Calendar.DAY_OF_MONTH, 1)
    }.time)
  }
}
