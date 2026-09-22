package com.lifeos.desktop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LifeOsAlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      AlarmManagerPermissionAction,
      -> runCatching { LifeOsAlarmScheduler.reschedulePersisted(context) }
    }
  }

  private companion object {
    const val AlarmManagerPermissionAction =
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
  }
}
