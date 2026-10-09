package com.lifeos.desktop

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LifeOsTodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    render(context, manager, appWidgetId)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action in setOf(Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) {
      refreshAll(context)
    }
  }

  companion object {
    const val EXTRA_OPEN_TODAY = "com.lifeos.desktop.OPEN_TODAY"
    private const val PREFS = "lifeos_today_widget"
    private const val KEY_SNAPSHOT = "snapshot"

    fun saveSnapshot(context: Context, rawJson: String) {
      require(rawJson.length <= 8192) { "Widget snapshot is too large." }
      val snapshot = JSONObject(rawJson)
      require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(snapshot.getString("date"))) {
        "Invalid widget date."
      }
      require(snapshot.getLong("updatedAtEpochMillis") > 0) { "Invalid widget timestamp." }
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(KEY_SNAPSHOT, rawJson).apply()
      refreshAll(context)
    }

    private fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, LifeOsTodayWidgetProvider::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val views = RemoteViews(context.packageName, R.layout.lifeos_today_widget)
      val intent = Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(EXTRA_OPEN_TODAY, true)
      }
      val click = PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.today_widget_root, click)

      val snapshot = try {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)
          ?.let(::JSONObject)
      } catch (_: Exception) {
        null
      }
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date())
      views.setTextViewText(
        R.id.today_widget_date,
        SimpleDateFormat("EEE, d MMM", Locale.forLanguageTag("ru-RU")).format(Date()),
      )
      val savedDate = snapshot?.optString("date")
      val updatedAt = snapshot?.optLong("updatedAtEpochMillis", 0L) ?: 0L
      val fresh = savedDate == today && updatedAt > 0 && updatedAt <= System.currentTimeMillis()
      val actions = if (fresh) snapshot?.optJSONArray("actions") else null
      val totalActions = (actions?.length() ?: 0) + (if (fresh) snapshot?.optInt("remainingCount", 0) ?: 0 else 0)
      views.setTextViewText(R.id.today_widget_actions_heading, "ДЕЙСТВИЯ · $totalActions")
      val main = if (fresh) snapshot?.optString("main")?.takeIf { it.isNotBlank() && it != "null" } else null
      val stale = !fresh || System.currentTimeMillis() - updatedAt > 2 * 60 * 60 * 1000L
      views.setTextViewText(
        R.id.today_widget_main,
        if (fresh) main ?: "Запланируйте главное на сегодня" else "Откройте LifeOS для обновления",
      )
      val maxRows = if (manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) >= 140) 3 else 2
      val rows = intArrayOf(R.id.today_widget_action_1, R.id.today_widget_action_2, R.id.today_widget_action_3)
      rows.forEachIndexed { index, viewId ->
        val text = if (index < maxRows) actions?.optString(index).orEmpty() else ""
        views.setViewVisibility(viewId, if (text.isBlank()) View.GONE else View.VISIBLE)
        if (text.isNotBlank()) views.setTextViewText(viewId, "○  $text")
      }
      val hidden = if (fresh) {
        maxOf(0, (actions?.length() ?: 0) - maxRows) + (snapshot?.optInt("remainingCount", 0) ?: 0)
      } else 0
      val status = when {
        !fresh -> "План на сегодня пока не загружен"
        stale -> "Обновлено ${SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(updatedAt))} · откройте приложение"
        hidden > 0 -> "Ещё $hidden в приложении"
        else -> "Открыть план дня"
      }
      views.setTextViewText(R.id.today_widget_status, status)
      manager.updateAppWidget(id, views)
    }
  }
}
