package com.lifeos.desktop

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class AndroidAlarmOccurrenceArgs {
  lateinit var id: String
  lateinit var cycleDate: String
  var scheduledAtEpochMillis: Long = 0
}

@InvokeArg
class AndroidAlarmScheduleArgs {
  var enabled: Boolean = false
  var settingsVersion: Int = 0
  lateinit var bedtime: String
  lateinit var wakeTime: String
  lateinit var timeZone: String
  var quietModeEnabled: Boolean = false
  lateinit var currentCycleDate: String
  var repeatReminderSuppressed: Boolean = false
  var soundUri: String? = null
  lateinit var soundTitle: String
  var nextOccurrence: AndroidAlarmOccurrenceArgs? = null
}

@InvokeArg
class AndroidAlarmReconcileArgs {
  lateinit var schedule: AndroidAlarmScheduleArgs
}

@InvokeArg
class AndroidAlarmTestArgs {
  var delaySeconds: Int = 20
  var soundUri: String? = null
  lateinit var soundTitle: String
}

@InvokeArg
class AndroidAlarmSettingsArgs {
  lateinit var issue: String
}

@InvokeArg
class AndroidEmergencyPhraseArgs {
  lateinit var phrase: String
}

@TauriPlugin
class LifeOsAlarmPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun reconcile(invoke: Invoke) {
    try {
      val input = invoke.parseArgs(AndroidAlarmReconcileArgs::class.java).schedule
      require(input.settingsVersion >= 1) { "Invalid sleep settings version." }
      val next = input.nextOccurrence?.let {
        require(it.id.isNotBlank() && it.cycleDate.isNotBlank() && it.scheduledAtEpochMillis > 0) {
          "Invalid wake occurrence."
        }
        LifeOsAlarmOccurrence(it.id, it.cycleDate, it.scheduledAtEpochMillis)
      }
      val status = LifeOsAlarmScheduler.reconcile(
        activity,
        LifeOsAlarmConfiguration(
          enabled = input.enabled,
          settingsVersion = input.settingsVersion,
          bedtime = input.bedtime,
          wakeTime = input.wakeTime,
          timeZone = input.timeZone,
          quietModeEnabled = input.quietModeEnabled,
          currentCycleDate = input.currentCycleDate,
          repeatReminderSuppressed = input.repeatReminderSuppressed,
          soundUri = input.soundUri,
          soundTitle = input.soundTitle,
          nextOccurrence = next,
        ),
      )
      invoke.resolve(status.toJsObject())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Android alarm reconcile failed.", "ALARM_RECONCILE_FAILED", error)
    }
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(LifeOsAlarmScheduler.status(activity).toJsObject())
  }

  @Command
  fun listSounds(invoke: Invoke) {
    try {
      val sounds = JSArray()
      val seen = mutableSetOf<String>()
      val defaultUri = RingtoneManager.getActualDefaultRingtoneUri(activity, RingtoneManager.TYPE_ALARM)
      sounds.put(soundObject(defaultUri?.toString(), "Системный сигнал"))
      defaultUri?.toString()?.let(seen::add)
      val manager = RingtoneManager(activity).apply { setType(RingtoneManager.TYPE_ALARM) }
      manager.cursor.use { cursor ->
        for (position in 0 until cursor.count) {
          cursor.moveToPosition(position)
          val uri = manager.getRingtoneUri(position)?.toString() ?: continue
          if (!seen.add(uri)) continue
          val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX)?.trim().orEmpty()
          if (title.isNotEmpty()) sounds.put(soundObject(uri, title))
        }
      }
      invoke.resolve(JSObject().apply { put("sounds", sounds) })
    } catch (error: Exception) {
      invoke.reject("Не удалось прочитать системные звуки.", "ALARM_SOUNDS_FAILED", error)
    }
  }

  @Command
  fun scheduleTest(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(AndroidAlarmTestArgs::class.java)
      invoke.resolve(
        LifeOsAlarmScheduler.scheduleTest(
          activity,
          args.delaySeconds,
          args.soundUri,
          args.soundTitle,
        ).toJsObject(),
      )
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Android test alarm failed.", "ALARM_TEST_FAILED", error)
    }
  }

  @Command
  fun openSettings(invoke: Invoke) {
    try {
      val issue = invoke.parseArgs(AndroidAlarmSettingsArgs::class.java).issue
      activity.runOnUiThread {
        when (issue) {
          "EXACT_ALARM" -> activity.startActivity(
            Intent(
              Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
              Uri.parse("package:${activity.packageName}"),
            ),
          )
          "NOTIFICATIONS" -> openNotificationPermission()
          "FULL_SCREEN" -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
              activity.startActivity(
                Intent(
                  Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                  Uri.parse("package:${activity.packageName}"),
                ),
              )
            }
          }
          "DND_POLICY" -> activity.startActivity(
            Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS),
          )
          else -> throw IllegalArgumentException("Unknown Android alarm setting.")
        }
        invoke.resolve()
      }
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Android alarm settings failed.", "ALARM_SETTINGS_FAILED", error)
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    activity.startService(Intent(activity, LifeOsAlarmRingingService::class.java).apply {
      action = LifeOsAlarmScheduler.ACTION_STOP
    })
    invoke.resolve()
  }

  @Command
  fun dismissalStatus(invoke: Invoke) {
    invoke.resolve(WakeChallengeStore(activity).status().toJsObject())
  }

  @Command
  fun regenerateDismissalQr(invoke: Invoke) {
    try {
      invoke.resolve(WakeChallengeStore(activity).regenerateQr().toJsObject())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Не удалось сохранить QR.", "WAKE_QR_FAILED", error)
    }
  }

  @Command
  fun saveEmergencyPhrase(invoke: Invoke) {
    try {
      val phrase = invoke.parseArgs(AndroidEmergencyPhraseArgs::class.java).phrase
      invoke.resolve(WakeChallengeStore(activity).saveEmergencyPhrase(phrase).toJsObject())
    } catch (error: Exception) {
      invoke.reject(
        error.message ?: "Не удалось сохранить аварийную фразу.",
        "WAKE_PHRASE_FAILED",
        error,
      )
    }
  }

  private fun openNotificationPermission() {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        47_106,
      )
      return
    }
    activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
      putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    })
  }

  private fun soundObject(uri: String?, title: String) = JSObject().apply {
    put("uri", uri)
    put("title", title)
  }
}

private fun LifeOsAlarmStatus.toJsObject() = JSObject().apply {
  put("supported", supported)
  put("state", state)
  put("exactAlarmGranted", exactAlarmGranted)
  put("notificationsGranted", notificationsGranted)
  put("fullScreenGranted", fullScreenGranted)
  put("notificationPolicyAccessGranted", notificationPolicyAccessGranted)
  put("issues", JSArray(issues))
  put("nextOccurrenceId", nextOccurrenceId)
  put("nextScheduledAtEpochMillis", nextScheduledAtEpochMillis)
  put("acknowledgedSettingsVersion", acknowledgedSettingsVersion)
  put("lastDeliveredAtEpochMillis", lastDeliveredAtEpochMillis)
  put("quietModeState", quietModeState)
  put("nextReminderAtEpochMillis", nextReminderAtEpochMillis)
  put("sleepEvents", JSArray().apply {
    sleepEvents.forEach { event ->
      put(JSObject().apply {
        put("id", event.id)
        put("cycleDate", event.cycleDate)
        put("kind", event.kind)
        put("occurredAtEpochMillis", event.occurredAtEpochMillis)
      })
    }
  })
  put("wakeResults", JSArray().apply {
    wakeResults.forEach { result ->
      put(JSObject().apply {
        put("id", result.id)
        put("occurrenceId", result.occurrenceId)
        put("cycleDate", result.cycleDate)
        put("kind", result.kind)
        put("recordedAtEpochMillis", result.recordedAtEpochMillis)
        put("emergencyReason", result.emergencyReason)
        put("emergencyComment", result.emergencyComment)
        put("waterCompletedAtEpochMillis", result.waterCompletedAtEpochMillis)
      })
    }
  })
  put("message", message)
}

private fun WakeDismissalSetupStatus.toJsObject() = JSObject().apply {
  put("supported", supported)
  put("qrConfigured", qrConfigured)
  put("emergencyPhraseConfigured", emergencyPhraseConfigured)
  put("qrSavedTo", qrSavedTo)
  put("lastWaterCompletedAtEpochMillis", lastWaterCompletedAtEpochMillis)
}
