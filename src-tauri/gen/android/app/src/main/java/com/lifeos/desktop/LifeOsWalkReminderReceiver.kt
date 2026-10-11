package com.lifeos.desktop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LifeOsWalkReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val date = intent.getStringExtra("cityDate") ?: return
    val revision = intent.getLongExtra("revision", 0)
    runCatching { LifeOsWalkReminderScheduler.dispatch(context, date, revision) }
  }
}
