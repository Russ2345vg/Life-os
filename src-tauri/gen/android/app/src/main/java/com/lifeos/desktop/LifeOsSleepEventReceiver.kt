package com.lifeos.desktop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LifeOsSleepEventReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != LifeOsEveningScheduler.ACTION_EVENT) return
    val type = intent.getStringExtra(LifeOsEveningScheduler.EXTRA_EVENT_TYPE)
      ?.let { value -> runCatching { SleepEventType.valueOf(value) }.getOrNull() }
      ?: return
    val cycleDate = intent.getStringExtra(LifeOsEveningScheduler.EXTRA_CYCLE_DATE) ?: return
    LifeOsEveningScheduler.acceptEvent(context, type, cycleDate)
  }
}
