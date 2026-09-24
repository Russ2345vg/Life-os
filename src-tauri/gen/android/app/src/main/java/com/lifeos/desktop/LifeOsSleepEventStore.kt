package com.lifeos.desktop

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

data class NativeSleepEvent(
  val id: String,
  val cycleDate: String,
  val kind: String,
  val occurredAtEpochMillis: Long,
)

data class NativeWakeResult(
  val id: String,
  val occurrenceId: String,
  val cycleDate: String,
  val kind: String,
  val recordedAtEpochMillis: Long,
  val emergencyReason: String?,
  val emergencyComment: String?,
  val waterCompletedAtEpochMillis: Long?,
)

class LifeOsSleepEventStore(context: Context) {
  private val storageContext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
    context.createDeviceProtectedStorageContext()
  } else {
    context
  }
  private val preferences = storageContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun events(): List<NativeSleepEvent> = readArray(KEY_EVENTS).mapNotNull { value ->
    runCatching {
      NativeSleepEvent(
        id = value.getString("id"),
        cycleDate = value.getString("cycleDate"),
        kind = value.getString("kind"),
        occurredAtEpochMillis = value.getLong("occurredAtEpochMillis"),
      )
    }.getOrNull()
  }.sortedWith(compareBy(NativeSleepEvent::occurredAtEpochMillis, NativeSleepEvent::id))

  fun wakeResults(): List<NativeWakeResult> = readArray(KEY_WAKE_RESULTS).mapNotNull { value ->
    runCatching {
      NativeWakeResult(
        id = value.getString("id"),
        occurrenceId = value.getString("occurrenceId"),
        cycleDate = value.getString("cycleDate"),
        kind = value.getString("kind"),
        recordedAtEpochMillis = value.getLong("recordedAtEpochMillis"),
        emergencyReason = value.optionalString("emergencyReason"),
        emergencyComment = value.optionalString("emergencyComment"),
        waterCompletedAtEpochMillis = value.optionalLong("waterCompletedAtEpochMillis"),
      )
    }.getOrNull()
  }.sortedWith(compareBy(NativeWakeResult::recordedAtEpochMillis, NativeWakeResult::id))

  fun recordEvent(id: String, cycleDate: String, kind: String, occurredAt: Long = now()): Boolean {
    val values = events().toMutableList()
    if (values.any { it.id == id }) return false
    values += NativeSleepEvent(id, cycleDate, kind, occurredAt)
    writeEvents(values.takeLast(MAX_ENTRIES))
    return true
  }

  fun recordWakeDelivered(occurrenceId: String, cycleDate: String, recordedAt: Long = now()) {
    upsertWakeResult(occurrenceId) { existing ->
      existing ?: NativeWakeResult(
        id = wakeResultId(occurrenceId),
        occurrenceId = occurrenceId,
        cycleDate = cycleDate,
        kind = "NO_RESULT",
        recordedAtEpochMillis = recordedAt,
        emergencyReason = null,
        emergencyComment = null,
        waterCompletedAtEpochMillis = null,
      )
    }
  }

  fun recordQrDismissal(occurrenceId: String, cycleDate: String, recordedAt: Long = now()) {
    upsertWakeResult(occurrenceId) { existing ->
      (existing ?: emptyWakeResult(occurrenceId, cycleDate, recordedAt)).copy(
        kind = "QR",
        recordedAtEpochMillis = recordedAt,
        emergencyReason = null,
        emergencyComment = null,
      )
    }
  }

  fun recordEmergencyDismissal(
    occurrenceId: String,
    cycleDate: String,
    reason: String?,
    comment: String?,
    recordedAt: Long = now(),
  ) {
    upsertWakeResult(occurrenceId) { existing ->
      (existing ?: emptyWakeResult(occurrenceId, cycleDate, recordedAt)).copy(
        kind = "EMERGENCY",
        recordedAtEpochMillis = recordedAt,
        emergencyReason = reason?.trim()?.takeIf(String::isNotEmpty),
        emergencyComment = comment?.trim()?.takeIf(String::isNotEmpty),
      )
    }
  }

  fun recordWater(occurrenceId: String, cycleDate: String, completedAt: Long = now()) {
    upsertWakeResult(occurrenceId) { existing ->
      (existing ?: emptyWakeResult(occurrenceId, cycleDate, completedAt)).copy(
        waterCompletedAtEpochMillis = completedAt,
      )
    }
  }

  private fun upsertWakeResult(
    occurrenceId: String,
    transform: (NativeWakeResult?) -> NativeWakeResult,
  ) {
    val values = wakeResults().toMutableList()
    val index = values.indexOfFirst { it.id == wakeResultId(occurrenceId) }
    val next = transform(values.getOrNull(index))
    if (index < 0) values += next else values[index] = next
    writeWakeResults(values.takeLast(MAX_ENTRIES))
  }

  private fun emptyWakeResult(occurrenceId: String, cycleDate: String, recordedAt: Long) =
    NativeWakeResult(
      id = wakeResultId(occurrenceId),
      occurrenceId = occurrenceId,
      cycleDate = cycleDate,
      kind = "NO_RESULT",
      recordedAtEpochMillis = recordedAt,
      emergencyReason = null,
      emergencyComment = null,
      waterCompletedAtEpochMillis = null,
    )

  private fun readArray(key: String): List<JSONObject> {
    val serialized = preferences.getString(key, null) ?: return emptyList()
    return runCatching {
      val array = JSONArray(serialized)
      (0 until array.length()).mapNotNull { index -> array.optJSONObject(index) }
    }.getOrDefault(emptyList())
  }

  private fun writeEvents(values: List<NativeSleepEvent>) {
    val array = JSONArray()
    values.forEach { event ->
      array.put(JSONObject().apply {
        put("id", event.id)
        put("cycleDate", event.cycleDate)
        put("kind", event.kind)
        put("occurredAtEpochMillis", event.occurredAtEpochMillis)
      })
    }
    preferences.edit().putString(KEY_EVENTS, array.toString()).apply()
  }

  private fun writeWakeResults(values: List<NativeWakeResult>) {
    val array = JSONArray()
    values.forEach { result ->
      array.put(JSONObject().apply {
        put("id", result.id)
        put("occurrenceId", result.occurrenceId)
        put("cycleDate", result.cycleDate)
        put("kind", result.kind)
        put("recordedAtEpochMillis", result.recordedAtEpochMillis)
        put("emergencyReason", result.emergencyReason ?: JSONObject.NULL)
        put("emergencyComment", result.emergencyComment ?: JSONObject.NULL)
        put("waterCompletedAtEpochMillis", result.waterCompletedAtEpochMillis ?: JSONObject.NULL)
      })
    }
    preferences.edit().putString(KEY_WAKE_RESULTS, array.toString()).apply()
  }

  private fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf(String::isNotEmpty)

  private fun JSONObject.optionalLong(name: String): Long? =
    if (isNull(name) || !has(name)) null else optLong(name).takeIf { it > 0L }

  private fun wakeResultId(occurrenceId: String) = "wake:$occurrenceId"

  private fun now() = System.currentTimeMillis()

  private companion object {
    const val PREFERENCES = "lifeos-sleep-events-v1"
    const val KEY_EVENTS = "events"
    const val KEY_WAKE_RESULTS = "wakeResults"
    const val MAX_ENTRIES = 180
  }
}
