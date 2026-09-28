package com.lifeos.desktop

import android.content.Context

class WakeProbeStore(context: Context) {
  private val preferences = context.createDeviceProtectedStorageContext()
    .getSharedPreferences("lifeos-wake-probe-v1", Context.MODE_PRIVATE)

  fun evidence(): WakeProbeEvidence? {
    val id = preferences.getString("id", null) ?: return null
    return WakeProbeEvidence(id, preferences.getLong("scheduledAt", 0),
      preferences.getLong("deliveredAt", 0).takeIf { it > 0 },
      preferences.getLong("confirmedAt", 0).takeIf { it > 0 },
      preferences.getString("fingerprint", "") ?: "")
  }

  fun scheduled(id: String, at: Long, fingerprint: String) {
    preferences.edit().clear().putString("id", id).putLong("scheduledAt", at)
      .putString("fingerprint", fingerprint).commit().also { check(it) }
  }

  fun delivered(id: String, at: Long) {
    if (evidence()?.occurrenceId == id) preferences.edit().putLong("deliveredAt", at).commit()
  }

  fun confirm(id: String, fingerprint: String): Boolean {
    if (!WakeProbePolicy.canConfirm(evidence(), id, fingerprint)) return false
    return preferences.edit().putLong("confirmedAt", System.currentTimeMillis()).commit()
  }

  fun invalidate() {
    preferences.edit().putString("fingerprint", "invalidated").commit()
  }
}
