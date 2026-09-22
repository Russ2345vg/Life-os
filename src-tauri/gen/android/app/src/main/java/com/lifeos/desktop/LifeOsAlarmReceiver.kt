package com.lifeos.desktop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class LifeOsAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != LifeOsAlarmScheduler.ACTION_RING) return
    val occurrenceId = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID) ?: return
    val cycleDate = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_CYCLE_DATE) ?: return
    val isTest = intent.getBooleanExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, false)
    if (!LifeOsAlarmScheduler.acceptDelivery(context, occurrenceId, cycleDate, isTest)) return

    val serviceIntent = Intent(context, LifeOsAlarmRingingService::class.java).apply {
      action = LifeOsAlarmScheduler.ACTION_RING
      putExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID, occurrenceId)
      putExtra(LifeOsAlarmScheduler.EXTRA_SOUND_URI, intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_SOUND_URI))
      putExtra(
        LifeOsAlarmScheduler.EXTRA_SOUND_TITLE,
        intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_SOUND_TITLE) ?: "Системный сигнал",
      )
      putExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, isTest)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }
}
