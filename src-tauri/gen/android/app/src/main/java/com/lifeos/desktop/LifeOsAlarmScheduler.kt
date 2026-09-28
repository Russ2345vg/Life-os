package com.lifeos.desktop

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.media.RingtoneManager
import androidx.core.content.ContextCompat

data class LifeOsAlarmOccurrence(
  val id: String,
  val cycleDate: String,
  val scheduledAtEpochMillis: Long,
)

data class LifeOsAlarmConfiguration(
  val enabled: Boolean,
  val settingsVersion: Int,
  val bedtime: String,
  val wakeTime: String,
  val timeZone: String,
  val quietModeEnabled: Boolean,
  val currentCycleDate: String,
  val repeatReminderSuppressed: Boolean,
  val soundUri: String?,
  val soundTitle: String,
  val nextOccurrence: LifeOsAlarmOccurrence?,
)

data class LifeOsAlarmStatus(
  val supported: Boolean = true,
  val state: String,
  val exactAlarmGranted: Boolean,
  val notificationsGranted: Boolean,
  val fullScreenGranted: Boolean,
  val notificationPolicyAccessGranted: Boolean,
  val issues: List<String>,
  val nextOccurrenceId: String?,
  val nextScheduledAtEpochMillis: Long?,
  val acknowledgedSettingsVersion: Int?,
  val lastDeliveredAtEpochMillis: Long?,
  val quietModeState: String,
  val nextReminderAtEpochMillis: Long?,
  val sleepEvents: List<NativeSleepEvent>,
  val wakeResults: List<NativeWakeResult>,
  val message: String?,
  val testEvidence: WakeProbeEvidence?,
  val testEvidenceValid: Boolean,
)

object LifeOsAlarmScheduler {
  const val ACTION_RING = "com.lifeos.desktop.alarm.RING"
  const val ACTION_STOP = "com.lifeos.desktop.alarm.STOP"
  const val EXTRA_OCCURRENCE_ID = "occurrenceId"
  const val EXTRA_CYCLE_DATE = "cycleDate"
  const val EXTRA_SOUND_URI = "soundUri"
  const val EXTRA_SOUND_TITLE = "soundTitle"
  const val EXTRA_IS_TEST = "isTest"

  private const val PREFS = "lifeos-alarm-v1"
  private const val REQUEST_RECURRING = 47_101
  private const val REQUEST_TEST = 47_102
  private const val REQUEST_SHOW = 47_103

  private const val KEY_ENABLED = "enabled"
  private const val KEY_SETTINGS_VERSION = "settingsVersion"
  private const val KEY_ACK_VERSION = "acknowledgedSettingsVersion"
  private const val KEY_WAKE_TIME = "wakeTime"
  private const val KEY_TIME_ZONE = "timeZone"
  private const val KEY_SOUND_URI = "soundUri"
  private const val KEY_SOUND_TITLE = "soundTitle"
  private const val KEY_NEXT_ID = "nextOccurrenceId"
  private const val KEY_NEXT_CYCLE = "nextCycleDate"
  private const val KEY_NEXT_AT = "nextScheduledAt"
  private const val KEY_LAST_DELIVERED_ID = "lastDeliveredId"
  private const val KEY_LAST_DELIVERED_AT = "lastDeliveredAt"
  private const val KEY_RINGING = "ringing"
  private const val KEY_LAST_ERROR = "lastError"

  fun reconcile(context: Context, configuration: LifeOsAlarmConfiguration): LifeOsAlarmStatus {
    LifeOsEveningScheduler.reconcile(
      context,
      LifeOsEveningConfiguration(
        bedtime = configuration.bedtime,
        wakeTime = configuration.wakeTime,
        timeZone = configuration.timeZone,
        currentCycleDate = configuration.currentCycleDate,
        repeatReminderSuppressed = configuration.repeatReminderSuppressed,
        quietModeEnabled = configuration.quietModeEnabled,
      ),
    )
    cancelRecurring(context)
    val preferences = preferences(context)
    preferences.edit()
      .putBoolean(KEY_ENABLED, configuration.enabled)
      .putInt(KEY_SETTINGS_VERSION, configuration.settingsVersion)
      .putString(KEY_WAKE_TIME, configuration.wakeTime)
      .putString(KEY_TIME_ZONE, configuration.timeZone)
      .putString(KEY_SOUND_URI, configuration.soundUri)
      .putString(KEY_SOUND_TITLE, configuration.soundTitle)
      .remove(KEY_ACK_VERSION)
      .remove(KEY_LAST_ERROR)
      .apply()

    val occurrence = configuration.nextOccurrence
    if (!configuration.enabled || occurrence == null) {
      preferences.edit()
        .remove(KEY_NEXT_ID)
        .remove(KEY_NEXT_CYCLE)
        .remove(KEY_NEXT_AT)
        .putInt(KEY_ACK_VERSION, configuration.settingsVersion)
        .apply()
      return status(context)
    }

    preferences.edit()
      .putString(KEY_NEXT_ID, occurrence.id)
      .putString(KEY_NEXT_CYCLE, occurrence.cycleDate)
      .putLong(KEY_NEXT_AT, occurrence.scheduledAtEpochMillis)
      .apply()

    val issues = capabilityIssues(context)
    if (issues.isNotEmpty()) {
      preferences.edit().putString(KEY_LAST_ERROR, "Нужны системные разрешения Android.").apply()
      return status(context)
    }

    return try {
      scheduleExact(
        context = context,
        occurrence = occurrence,
        soundUri = configuration.soundUri,
        soundTitle = configuration.soundTitle,
        isTest = false,
      )
      preferences.edit().putInt(KEY_ACK_VERSION, configuration.settingsVersion).apply()
      status(context)
    } catch (error: Exception) {
      preferences.edit()
        .remove(KEY_ACK_VERSION)
        .putString(KEY_LAST_ERROR, error.message ?: "Android не установил будильник.")
        .apply()
      status(context)
    }
  }

  fun status(context: Context): LifeOsAlarmStatus {
    val preferences = preferences(context)
    val enabled = preferences.getBoolean(KEY_ENABLED, false)
    val exact = exactAlarmGranted(context)
    val notifications = notificationsGranted(context)
    val fullScreen = fullScreenGranted(context)
    val evening = LifeOsEveningScheduler.status(context)
    val alarmIssues = if (enabled) capabilityIssues(context) else emptyList()
    val issues = buildList {
      addAll(alarmIssues)
      if (
        LifeOsEveningScheduler.quietModeEnabled(context) &&
        !evening.notificationPolicyAccessGranted
      ) {
        add("DND_POLICY")
      }
    }
    val nextId = preferences.getString(KEY_NEXT_ID, null)
    val nextAt = preferences.getLong(KEY_NEXT_AT, 0L).takeIf { it > 0L }
    val error = preferences.getString(KEY_LAST_ERROR, null)
    val ringing = preferences.getBoolean(KEY_RINGING, false)
    val probeStore = WakeProbeStore(context)
    val fingerprint = testFingerprint(context)
    val probe = probeStore.evidence()
    if (probe != null && probe.fingerprint != fingerprint) probeStore.invalidate()
    val state = LifeOsAlarmStatusPolicy.state(
      ringing = ringing,
      hasAlarmCapabilityIssues = alarmIssues.isNotEmpty(),
      error = error,
      enabled = enabled,
      hasScheduledOccurrence = nextId != null && nextAt != null,
    )
    return LifeOsAlarmStatus(
      state = state,
      exactAlarmGranted = exact,
      notificationsGranted = notifications,
      fullScreenGranted = fullScreen,
      notificationPolicyAccessGranted = evening.notificationPolicyAccessGranted,
      issues = issues,
      nextOccurrenceId = nextId,
      nextScheduledAtEpochMillis = nextAt,
      acknowledgedSettingsVersion = if (preferences.contains(KEY_ACK_VERSION)) {
        preferences.getInt(KEY_ACK_VERSION, 0)
      } else {
        null
      },
      lastDeliveredAtEpochMillis = preferences.getLong(KEY_LAST_DELIVERED_AT, 0L).takeIf { it > 0L },
      quietModeState = evening.quietModeState,
      nextReminderAtEpochMillis = evening.nextReminderAtEpochMillis,
      sleepEvents = LifeOsSleepEventStore(context).events(),
      wakeResults = LifeOsSleepEventStore(context).wakeResults(),
      message = error,
      testEvidence = probe,
      testEvidenceValid = probe != null && probe.fingerprint == fingerprint,
    )
  }

  fun scheduleTest(context: Context, delaySeconds: Int, soundUri: String?, soundTitle: String): LifeOsAlarmStatus {
    require(delaySeconds in 5..300) { "Пробный сигнал можно поставить через 5–300 секунд." }
    val issues = capabilityIssues(context)
    require(issues.isEmpty()) { "Разрешите точные будильники, уведомления и полный экран перед проверкой." }
    check(!preferences(context).getBoolean(KEY_RINGING, false)) { "Сначала завершите текущий сигнал." }
    val trigger = System.currentTimeMillis() + delaySeconds * 1_000L
    val probeStore = WakeProbeStore(context)
    probeStore.scheduled("test-$trigger", trigger, testFingerprint(context))
    try {
    scheduleExact(
      context = context,
      occurrence = LifeOsAlarmOccurrence("test-$trigger", "test", trigger),
      soundUri = soundUri,
      soundTitle = soundTitle,
      isTest = true,
    )
    } catch (error: Exception) {
      probeStore.invalidate()
      throw error
    }
    return status(context).copy(message = "Пробный сигнал прозвучит через $delaySeconds секунд.")
  }

  fun reschedulePersisted(context: Context) {
    LifeOsEveningScheduler.reschedulePersisted(context)
    val preferences = preferences(context)
    if (!preferences.getBoolean(KEY_ENABLED, false) || capabilityIssues(context).isNotEmpty()) return
    val wakeTime = preferences.getString(KEY_WAKE_TIME, null) ?: return
    val timeZone = preferences.getString(KEY_TIME_ZONE, null) ?: return
    val storedCycle = preferences.getString(KEY_NEXT_CYCLE, null) ?: return
    val now = System.currentTimeMillis()
    val storedAt = preferences.getLong(KEY_NEXT_AT, 0L)
    val cycleDate = AlarmScheduleMath.restoredCycle(
      storedCycle,
      storedAt,
      wakeTime,
      timeZone,
      now,
    )
    val occurrenceId = if (cycleDate == storedCycle) {
      preferences.getString(KEY_NEXT_ID, null) ?: "native-$cycleDate"
    } else {
      "native-$cycleDate"
    }
    val trigger = AlarmScheduleMath.restoredTrigger(storedAt, now) {
      AlarmScheduleMath.triggerForCycleDate(cycleDate, wakeTime, timeZone)
    }
    preferences.edit()
      .putString(KEY_NEXT_ID, occurrenceId)
      .putString(KEY_NEXT_CYCLE, cycleDate)
      .putLong(KEY_NEXT_AT, trigger)
      .remove(KEY_LAST_ERROR)
      .apply()
    scheduleExact(
      context,
      LifeOsAlarmOccurrence(occurrenceId, cycleDate, trigger),
      preferences.getString(KEY_SOUND_URI, null),
      preferences.getString(KEY_SOUND_TITLE, "Системный сигнал") ?: "Системный сигнал",
      false,
    )
  }

  fun acceptDelivery(context: Context, occurrenceId: String, cycleDate: String, isTest: Boolean): Boolean {
    val preferences = preferences(context)
    if (isTest) {
      val evidence = WakeProbeStore(context).evidence()
      if (evidence?.occurrenceId != occurrenceId || evidence.fingerprint != testFingerprint(context)) return false
      if (preferences.getBoolean(KEY_RINGING, false)) return false
      WakeProbeStore(context).delivered(occurrenceId, System.currentTimeMillis())
    }
    val previousDeliveryKey = preferences.getString(KEY_LAST_DELIVERED_ID, null)
    if (!AlarmDeliveryPolicy.shouldAccept(previousDeliveryKey, occurrenceId, isTest)) return false
    val deliveryKey = AlarmDeliveryPolicy.deliveryKey(occurrenceId, isTest)
    preferences.edit()
      .putString(KEY_LAST_DELIVERED_ID, deliveryKey)
      .putLong(KEY_LAST_DELIVERED_AT, System.currentTimeMillis())
      .putBoolean(KEY_RINGING, true)
      .apply()
    if (!isTest) {
      LifeOsSleepEventStore(context).recordWakeDelivered(occurrenceId, cycleDate)
    }
    if (!isTest && preferences.getBoolean(KEY_ENABLED, false)) {
      val wakeTime = preferences.getString(KEY_WAKE_TIME, null) ?: return true
      val timeZone = preferences.getString(KEY_TIME_ZONE, null) ?: return true
      val nextCycle = AlarmScheduleMath.nextCycleDate(cycleDate, timeZone)
      val nextAt = AlarmScheduleMath.triggerForCycleDate(nextCycle, wakeTime, timeZone)
      val nextId = "native-$nextCycle"
      preferences.edit()
        .putString(KEY_NEXT_ID, nextId)
        .putString(KEY_NEXT_CYCLE, nextCycle)
        .putLong(KEY_NEXT_AT, nextAt)
        .apply()
      if (capabilityIssues(context).isEmpty()) {
        scheduleExact(
          context,
          LifeOsAlarmOccurrence(nextId, nextCycle, nextAt),
          preferences.getString(KEY_SOUND_URI, null),
          preferences.getString(KEY_SOUND_TITLE, "Системный сигнал") ?: "Системный сигнал",
          false,
        )
      }
    }
    return true
  }

  fun markRinging(context: Context, ringing: Boolean) {
    preferences(context).edit().putBoolean(KEY_RINGING, ringing).apply()
  }

  fun confirmTestHeard(context: Context, occurrenceId: String): Boolean {
    if (!isCurrentTest(context, occurrenceId)) return false
    return WakeProbeStore(context).confirm(occurrenceId, testFingerprint(context))
  }

  fun isCurrentTest(context: Context, occurrenceId: String): Boolean =
    matchesCurrentDelivery(context, occurrenceId, true)

  fun matchesCurrentDelivery(context: Context, occurrenceId: String, isTest: Boolean): Boolean =
    preferences(context).getBoolean(KEY_RINGING, false) &&
      preferences(context).getString(KEY_LAST_DELIVERED_ID, null) == AlarmDeliveryPolicy.deliveryKey(occurrenceId, isTest)

  fun currentTestOccurrenceId(context: Context): String? =
    WakeProbeStore(context).evidence()?.occurrenceId?.takeIf { isCurrentTest(context, it) }

  private fun testFingerprint(context: Context): String {
    val prefs = preferences(context)
    val soundUri = prefs.getString(KEY_SOUND_URI, null)
      ?: RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM)?.toString()
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)?.toString()
    return listOf(prefs.getInt(KEY_SETTINGS_VERSION, 0), soundUri,
      exactAlarmGranted(context), notificationsGranted(context), fullScreenGranted(context)).joinToString("|")
  }

  fun cancelTest(context: Context) {
    alarmManager(context).cancel(alarmPendingIntent(context, null, null, null, null, true))
  }

  private fun scheduleExact(
    context: Context,
    occurrence: LifeOsAlarmOccurrence,
    soundUri: String?,
    soundTitle: String,
    isTest: Boolean,
  ) {
    require(occurrence.scheduledAtEpochMillis > System.currentTimeMillis()) {
      "Время будильника уже прошло."
    }
    val operation = alarmPendingIntent(
      context,
      occurrence.id,
      occurrence.cycleDate,
      soundUri,
      soundTitle,
      isTest,
    )
    val showIntent = PendingIntent.getActivity(
      context,
      REQUEST_SHOW,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    alarmManager(context).setAlarmClock(
      AlarmManager.AlarmClockInfo(occurrence.scheduledAtEpochMillis, showIntent),
      operation,
    )
  }

  private fun cancelRecurring(context: Context) {
    alarmManager(context).cancel(alarmPendingIntent(context, null, null, null, null, false))
  }

  private fun alarmPendingIntent(
    context: Context,
    occurrenceId: String?,
    cycleDate: String?,
    soundUri: String?,
    soundTitle: String?,
    isTest: Boolean,
  ): PendingIntent {
    val intent = Intent(context, LifeOsAlarmReceiver::class.java).apply {
      action = ACTION_RING
      if (occurrenceId != null) putExtra(EXTRA_OCCURRENCE_ID, occurrenceId)
      if (cycleDate != null) putExtra(EXTRA_CYCLE_DATE, cycleDate)
      if (soundUri != null) putExtra(EXTRA_SOUND_URI, soundUri)
      if (soundTitle != null) putExtra(EXTRA_SOUND_TITLE, soundTitle)
      putExtra(EXTRA_IS_TEST, isTest)
    }
    return PendingIntent.getBroadcast(
      context,
      if (isTest) REQUEST_TEST else REQUEST_RECURRING,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun capabilityIssues(context: Context): List<String> = buildList {
    if (!exactAlarmGranted(context)) add("EXACT_ALARM")
    if (!notificationsGranted(context)) add("NOTIFICATIONS")
    if (!fullScreenGranted(context)) add("FULL_SCREEN")
  }

  private fun exactAlarmGranted(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(context).canScheduleExactAlarms()

  private fun notificationsGranted(context: Context): Boolean {
    val runtimeGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    return runtimeGranted && notificationManager(context).areNotificationsEnabled()
  }

  private fun fullScreenGranted(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
      notificationManager(context).canUseFullScreenIntent()

  private fun preferences(context: Context) =
    context.createDeviceProtectedStorageContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun alarmManager(context: Context) = context.getSystemService(AlarmManager::class.java)

  private fun notificationManager(context: Context) =
    context.getSystemService(NotificationManager::class.java)
}
