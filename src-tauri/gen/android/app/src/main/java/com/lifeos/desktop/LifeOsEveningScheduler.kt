package com.lifeos.desktop

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

data class LifeOsEveningConfiguration(
  val bedtime: String,
  val wakeTime: String,
  val timeZone: String,
  val currentCycleDate: String,
  val repeatReminderSuppressed: Boolean,
  val quietModeEnabled: Boolean,
)

data class LifeOsEveningStatus(
  val notificationPolicyAccessGranted: Boolean,
  val quietModeState: String,
  val nextReminderAtEpochMillis: Long?,
)

object LifeOsEveningScheduler {
  const val ACTION_EVENT = "com.lifeos.desktop.sleep.EVENT"
  const val EXTRA_EVENT_TYPE = "eventType"
  const val EXTRA_CYCLE_DATE = "cycleDate"

  private const val PREFERENCES = "lifeos-evening-v1"
  private const val KEY_BEDTIME = "bedtime"
  private const val KEY_WAKE_TIME = "wakeTime"
  private const val KEY_TIME_ZONE = "timeZone"
  private const val KEY_CURRENT_CYCLE = "currentCycleDate"
  private const val KEY_REPEAT_SUPPRESSED = "repeatReminderSuppressed"
  private const val KEY_QUIET_ENABLED = "quietModeEnabled"
  private const val CHANNEL_ID = "lifeos-sleep-reminders"

  fun reconcile(context: Context, configuration: LifeOsEveningConfiguration) {
    preferences(context).edit()
      .putString(KEY_BEDTIME, configuration.bedtime)
      .putString(KEY_WAKE_TIME, configuration.wakeTime)
      .putString(KEY_TIME_ZONE, configuration.timeZone)
      .putString(KEY_CURRENT_CYCLE, configuration.currentCycleDate)
      .putBoolean(KEY_REPEAT_SUPPRESSED, configuration.repeatReminderSuppressed)
      .putBoolean(KEY_QUIET_ENABLED, configuration.quietModeEnabled)
      .apply()
    cancelAll(context)
    reconcileCurrentQuietWindow(context, configuration)
    scheduleAll(context, configuration)
  }

  fun reschedulePersisted(context: Context) {
    val configuration = readConfiguration(context) ?: return
    cancelAll(context)
    reconcileCurrentQuietWindow(context, configuration)
    scheduleAll(context, configuration)
  }

  fun acceptEvent(context: Context, type: SleepEventType, cycleDate: String) {
    val configuration = readConfiguration(context) ?: return
    val store = LifeOsSleepEventStore(context)
    when (type) {
      SleepEventType.REMINDER_60 -> {
        if (store.recordEvent("REMINDER_60:$cycleDate", cycleDate, "REMINDER_60")) {
          showReminder(context, 47_120, "До сна остался 1 час", "Откройте подготовку ко сну")
        }
        if (configuration.quietModeEnabled && LifeOsQuietModeController.activate(context)) {
          store.recordEvent("QUIET_STARTED:$cycleDate", cycleDate, "QUIET_STARTED")
        }
      }
      SleepEventType.REMINDER_15 -> {
        val suppressed =
          cycleDate == configuration.currentCycleDate && configuration.repeatReminderSuppressed
        if (!suppressed && store.recordEvent("REMINDER_15:$cycleDate", cycleDate, "REMINDER_15")) {
          showReminder(context, 47_121, "До сна 15 минут", "Завершите оставшиеся пункты подготовки")
        }
      }
      SleepEventType.BEDTIME -> {
        if (store.recordEvent("BEDTIME:$cycleDate", cycleDate, "BEDTIME")) {
          showReminder(context, 47_122, "Пора спать", "Подготовка останется доступной до утра")
        }
      }
      SleepEventType.QUIET_END -> {
        finishQuietMode(context, cycleDate)
      }
    }
    cancelAll(context)
    scheduleAll(context, configuration)
  }

  fun status(context: Context): LifeOsEveningStatus {
    val configuration = readConfiguration(context)
    val nextReminder = configuration?.let {
      SleepEventScheduleMath.nextEvents(
        startingCycleDate = it.currentCycleDate,
        bedtime = it.bedtime,
        wakeTime = it.wakeTime,
        timeZone = it.timeZone,
        repeatSuppressedForStartingCycle = it.repeatReminderSuppressed,
        nowEpochMillis = System.currentTimeMillis(),
      ).filterKeys { type -> type != SleepEventType.QUIET_END }
        .values.minOfOrNull(ScheduledSleepEvent::triggerAtEpochMillis)
    }
    return LifeOsEveningStatus(
      notificationPolicyAccessGranted = LifeOsQuietModeController.hasPolicyAccess(context),
      quietModeState = LifeOsQuietModeController.state(
        context,
        configuration?.quietModeEnabled == true,
      ),
      nextReminderAtEpochMillis = nextReminder,
    )
  }

  fun quietModeEnabled(context: Context): Boolean =
    preferences(context).getBoolean(KEY_QUIET_ENABLED, false)

  fun finishQuietMode(context: Context, cycleDate: String) {
    val wasActive = LifeOsQuietModeController.isActiveRequested(context)
    LifeOsQuietModeController.deactivate(context)
    if (wasActive) {
      LifeOsSleepEventStore(context).recordEvent(
        "QUIET_ENDED:$cycleDate",
        cycleDate,
        "QUIET_ENDED",
      )
    }
  }

  private fun scheduleAll(context: Context, configuration: LifeOsEveningConfiguration) {
    val events = SleepEventScheduleMath.nextEvents(
      startingCycleDate = configuration.currentCycleDate,
      bedtime = configuration.bedtime,
      wakeTime = configuration.wakeTime,
      timeZone = configuration.timeZone,
      repeatSuppressedForStartingCycle = configuration.repeatReminderSuppressed,
      nowEpochMillis = System.currentTimeMillis(),
    )
    events.values.forEach { event ->
      if (event.type == SleepEventType.QUIET_END && !configuration.quietModeEnabled) return@forEach
      if (event.type == SleepEventType.QUIET_END || notificationsGranted(context)) {
        schedule(context, event)
      }
    }
  }

  private fun schedule(context: Context, event: ScheduledSleepEvent) {
    val manager = context.getSystemService(AlarmManager::class.java)
    val operation = pendingIntent(context, event.type, event.cycleDate)
    if (event.type == SleepEventType.QUIET_END || !manager.canScheduleExactAlarmsCompat()) {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.triggerAtEpochMillis, operation)
    } else {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.triggerAtEpochMillis, operation)
    }
  }

  private fun cancelAll(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    SleepEventType.entries.forEach { type -> manager.cancel(pendingIntent(context, type, null)) }
  }

  private fun pendingIntent(context: Context, type: SleepEventType, cycleDate: String?): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      47_110 + type.ordinal,
      Intent(context, LifeOsSleepEventReceiver::class.java).apply {
        action = ACTION_EVENT
        putExtra(EXTRA_EVENT_TYPE, type.name)
        if (cycleDate != null) putExtra(EXTRA_CYCLE_DATE, cycleDate)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun reconcileCurrentQuietWindow(
    context: Context,
    configuration: LifeOsEveningConfiguration,
  ) {
    if (!configuration.quietModeEnabled) {
      LifeOsQuietModeController.deactivate(context)
      return
    }
    val now = System.currentTimeMillis()
    val bedtimeAt = SleepEventScheduleMath.bedtimeForCycleDate(
      configuration.currentCycleDate,
      configuration.bedtime,
      configuration.wakeTime,
      configuration.timeZone,
    )
    val wakeAt = AlarmScheduleMath.triggerForCycleDate(
      configuration.currentCycleDate,
      configuration.wakeTime,
      configuration.timeZone,
    )
    if (now in (bedtimeAt - 60 * 60_000L) until wakeAt) {
      if (LifeOsQuietModeController.activate(context)) {
        LifeOsSleepEventStore(context).recordEvent(
          "QUIET_STARTED:${configuration.currentCycleDate}",
          configuration.currentCycleDate,
          "QUIET_STARTED",
        )
      }
    } else {
      LifeOsQuietModeController.deactivate(context)
    }
  }

  private fun showReminder(context: Context, id: Int, title: String, body: String) {
    createChannel(context)
    val content = PendingIntent.getActivity(
      context,
      47_119,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    context.getSystemService(NotificationManager::class.java).notify(
      id,
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(body)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setContentIntent(content)
        .setAutoCancel(true)
        .build(),
    )
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Напоминания о сне",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply { description = "Вечерние напоминания LifeOS, отдельно от будильника" },
    )
  }

  private fun readConfiguration(context: Context): LifeOsEveningConfiguration? {
    val preferences = preferences(context)
    return LifeOsEveningConfiguration(
      bedtime = preferences.getString(KEY_BEDTIME, null) ?: return null,
      wakeTime = preferences.getString(KEY_WAKE_TIME, null) ?: return null,
      timeZone = preferences.getString(KEY_TIME_ZONE, null) ?: return null,
      currentCycleDate = preferences.getString(KEY_CURRENT_CYCLE, null) ?: return null,
      repeatReminderSuppressed = preferences.getBoolean(KEY_REPEAT_SUPPRESSED, false),
      quietModeEnabled = preferences.getBoolean(KEY_QUIET_ENABLED, false),
    )
  }

  private fun preferences(context: Context) = context.createDeviceProtectedStorageContext()
    .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun notificationsGranted(context: Context): Boolean {
    val runtime = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    return runtime && context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
  }

  private fun AlarmManager.canScheduleExactAlarmsCompat(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || canScheduleExactAlarms()
}
