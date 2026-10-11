package com.lifeos.desktop

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class WalkReminderConfiguration(
  val revision: Long, val timeZone: String, val enabled: Boolean,
  val throughCityDate: String, val days: List<WalkReminderDay>,
) {
  companion object {
    fun parse(raw: String): WalkReminderConfiguration {
      require(raw.toByteArray(Charsets.UTF_8).size <= 128 * 1024) { "Calendar too large." }
      val obj = JSONObject(raw)
      require(obj.getInt("schemaVersion") == 1 && obj.getLong("revision") in 1..4_294_967_295L)
      val zone = obj.getString("timeZone")
      require(zone.length <= 200 && zone in TimeZone.getAvailableIDs()) { "Invalid time zone." }
      require(obj.getString("cityId").length in 1..200)
      val dates = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
        isLenient = false; timeZone = TimeZone.getTimeZone("UTC")
      }
      fun dayMillis(value: String): Long {
        require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(value))
        val parsed = requireNotNull(dates.parse(value))
        require(dates.format(parsed) == value)
        return parsed.time
      }
      val start = dayMillis(obj.getString("fromCityDate"))
      val through = obj.getString("throughCityDate")
      require(dayMillis(through) == start + 399 * 86_400_000L)
      val array = obj.getJSONArray("days")
      require(array.length() == 400)
      var previous = 0L
      val days = (0 until 400).map { offset ->
        val entry = array.getJSONObject(offset)
        val date = entry.getString("cityDate")
        val dateAt = dayMillis(date)
        require(dateAt == start + offset * 86_400_000L)
        val sunset = if (entry.isNull("sunsetAt")) null else entry.getLong("sunsetAt")
        val walk = if (entry.isNull("walkStartAt")) null else entry.getLong("walkStartAt")
        require((sunset == null) == (walk == null))
        if (sunset != null && walk != null) {
          require(walk > previous && walk > 0 && sunset > 0 &&
            sunset % 60_000 == 0L && walk % 60_000 == 0L && sunset - walk == 900_000L &&
            kotlin.math.abs(sunset / 86_400_000L - dateAt / 86_400_000L) <= 2)
          previous = walk
        }
        WalkReminderDay(date, sunset, walk)
      }
      return WalkReminderConfiguration(obj.getLong("revision"), zone, obj.getBoolean("enabled"), through, days)
    }
  }
}

object LifeOsWalkReminderScheduler {
  private const val CHANNEL = "lifeos-walk"
  private const val PREFS = "lifeos-walk-reminders-v1"
  private const val REQUEST = 47_120
  private const val ACTION = "com.lifeos.desktop.walk.REMIND"

  private fun preferences(context: Context): SharedPreferences {
    val storage = if (Build.VERSION.SDK_INT >= 24) context.createDeviceProtectedStorageContext() else context
    return storage.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  }

  @Synchronized fun reconcile(context: Context, raw: String): JSObject {
    val configuration = WalkReminderConfiguration.parse(raw) // Validate before replacing the old queue.
    val prefs = preferences(context)
    val previous = prefs.getString("configuration", null)?.let { runCatching { WalkReminderConfiguration.parse(it) }.getOrNull() }
    require(previous == null || configuration.revision >= previous.revision) { "Stale walk settings." }
    cancel(context, prefs)
    check(prefs.edit().putString("configuration", raw).commit()) { "Cannot save walk calendar." }
    return schedule(context, configuration, prefs)
  }

  @Synchronized fun restorePersisted(context: Context): JSObject {
    val prefs = preferences(context)
    val raw = prefs.getString("configuration", null) ?: return receipt(null, "disabled", null, "Выберите город в LifeOS.")
    return try { schedule(context, WalkReminderConfiguration.parse(raw), prefs) }
    catch (error: Exception) {
      cancel(context, prefs)
      receipt(runCatching { WalkReminderConfiguration.parse(raw) }.getOrNull(), "error", null, error.message)
    }
  }

  @Synchronized fun dispatch(context: Context, cityDate: String, revision: Long) {
    val prefs = preferences(context)
    val cfg = prefs.getString("configuration", null)?.let { runCatching { WalkReminderConfiguration.parse(it) }.getOrNull() } ?: return
    val day = cfg.days.firstOrNull { it.cityDate == cityDate } ?: return
    val delivered = prefs.getStringSet("delivered", emptySet()).orEmpty().toMutableSet()
    if (WalkReminderSchedulePolicy.canDispatch(day, System.currentTimeMillis(), revision, cfg.revision, cfg.enabled, delivered) && permissions(context).isEmpty()) {
      // Persist before posting: repeated receivers, boot and retries cannot post a second signal.
      delivered.add(cityDate)
      check(prefs.edit().putStringSet("delivered", delivered.sorted().takeLast(400).toSet()).commit())
      val launch = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val content = PendingIntent.getActivity(context, REQUEST + 1, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val notification = NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(context.applicationInfo.icon).setContentTitle("Пора на прогулку")
        .setContentText("До заката 15 минут. Хорошей прогулки!")
        .setContentIntent(content).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).build()
      context.getSystemService(NotificationManager::class.java).notify(REQUEST, notification)
    }
    schedule(context, cfg, prefs)
  }

  private fun pending(context: Context, date: String, revision: Long): PendingIntent =
    PendingIntent.getBroadcast(context, REQUEST, Intent(context, LifeOsWalkReminderReceiver::class.java).apply {
      action = ACTION
      data = Uri.parse("lifeos-walk://reminder/$revision/$date")
      putExtra("cityDate", date); putExtra("revision", revision)
    }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun cancel(context: Context, prefs: SharedPreferences) {
    val date = prefs.getString("pendingDate", null)
    if (date != null) {
      val intent = pending(context, date, prefs.getLong("pendingRevision", 0))
      context.getSystemService(AlarmManager::class.java).cancel(intent)
      intent.cancel()
    }
    check(prefs.edit().remove("pendingDate").remove("pendingRevision").commit())
  }

  private fun permissions(context: Context): List<String> {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Прогулка перед закатом", NotificationManager.IMPORTANCE_DEFAULT))
    val issues = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= 31 && !context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()) issues.add("EXACT_ALARM")
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled() ||
      (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) ||
      (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE)) issues.add("NOTIFICATIONS")
    return issues
  }

  private fun schedule(context: Context, cfg: WalkReminderConfiguration, prefs: SharedPreferences): JSObject {
    cancel(context, prefs)
    if (!cfg.enabled) return receipt(cfg, "disabled", null, null)
    val issues = permissions(context)
    if (issues.isNotEmpty()) return receipt(cfg, "permission-required", null, "Разрешите ${issues.joinToString(", ")} в настройках Android.")
    val now = System.currentTimeMillis()
    val next = WalkReminderSchedulePolicy.next(cfg.days, now, prefs.getStringSet("delivered", emptySet()).orEmpty())
    if (next == null) {
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone(cfg.timeZone) }.format(Date(now))
      return receipt(cfg, if (today > cfg.throughCityDate) "expired" else "error", null,
        if (today > cfg.throughCityDate) "Откройте LifeOS, чтобы продлить календарь." else "В сохранённом календаре больше нет будущих закатов.")
    }
    return try {
      val intent = pending(context, next.cityDate, cfg.revision)
      context.getSystemService(AlarmManager::class.java).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.walkStartAt!!, intent)
      check(prefs.edit().putString("pendingDate", next.cityDate).putLong("pendingRevision", cfg.revision).commit())
      receipt(cfg, "scheduled", next.walkStartAt, null)
    } catch (error: Exception) {
      cancel(context, prefs)
      receipt(cfg, "error", null, error.message ?: "Не удалось поставить напоминание.")
    }
  }

  private fun receipt(cfg: WalkReminderConfiguration?, state: String, at: Long?, message: String?) = JSObject().apply {
    put("revision", cfg?.revision ?: 0); put("state", state)
    put("nextTriggerAt", at ?: JSONObject.NULL)
    put("throughCityDate", cfg?.throughCityDate ?: JSONObject.NULL)
    put("checkedAt", System.currentTimeMillis()); put("message", message ?: JSONObject.NULL)
  }
}
