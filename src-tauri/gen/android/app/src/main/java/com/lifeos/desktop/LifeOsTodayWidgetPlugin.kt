package com.lifeos.desktop

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class TodayWidgetSnapshotArgs {
  lateinit var snapshotJson: String
}

@TauriPlugin
class LifeOsTodayWidgetPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun update(invoke: Invoke) {
    try {
      val json = invoke.parseArgs(TodayWidgetSnapshotArgs::class.java).snapshotJson
      LifeOsTodayWidgetProvider.saveSnapshot(activity, json)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Today widget update failed.", "WIDGET_UPDATE_FAILED", error)
    }
  }

  @Command
  fun consumeOpen(invoke: Invoke) {
    val intent = activity.intent
    val requested = intent?.getBooleanExtra(LifeOsTodayWidgetProvider.EXTRA_OPEN_TODAY, false) == true
    intent?.removeExtra(LifeOsTodayWidgetProvider.EXTRA_OPEN_TODAY)
    invoke.resolve(JSObject().apply { put("openToday", requested) })
  }
}
