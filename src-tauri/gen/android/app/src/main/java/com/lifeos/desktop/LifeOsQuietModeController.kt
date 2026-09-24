package com.lifeos.desktop

import android.app.AutomaticZenRule
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.service.notification.Condition
import android.service.notification.ZenPolicy

object LifeOsQuietModeController {
  private const val PREFERENCES = "lifeos-quiet-mode-v1"
  private const val KEY_RULE_ID = "ruleId"
  private const val KEY_ACTIVE_REQUESTED = "activeRequested"
  private const val RULE_NAME = "Ночной режим LifeOS"

  fun hasPolicyAccess(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

  fun state(context: Context, enabled: Boolean): String {
    if (!enabled) return "DISABLED"
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "UNAVAILABLE"
    if (!hasPolicyAccess(context)) return "READY"
    val requested = isActiveRequested(context)
    val ruleId = preferences(context).getString(KEY_RULE_ID, null)
    if (!requested) return "READY"
    if (ruleId == null) return "ERROR"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      return runCatching {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getAutomaticZenRuleState(ruleId) == Condition.STATE_TRUE) {
          "ACTIVE"
        } else {
          "OVERRIDDEN"
        }
      }.getOrDefault("ERROR")
    }
    return "ACTIVE"
  }

  fun activate(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !hasPolicyAccess(context)) return false
    return runCatching {
      val ruleId = ensureOwnedRule(context) ?: return false
      publishState(context, ruleId, true)
      preferences(context).edit().putBoolean(KEY_ACTIVE_REQUESTED, true).apply()
      true
    }.getOrDefault(false)
  }

  fun deactivate(context: Context) {
    val ruleId = preferences(context).getString(KEY_RULE_ID, null)
    preferences(context).edit().putBoolean(KEY_ACTIVE_REQUESTED, false).apply()
    if (ruleId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && hasPolicyAccess(context)) {
      runCatching { publishState(context, ruleId, false) }
    }
  }

  fun isActiveRequested(context: Context): Boolean =
    preferences(context).getBoolean(KEY_ACTIVE_REQUESTED, false)

  private fun ensureOwnedRule(context: Context): String? {
    val manager = context.getSystemService(NotificationManager::class.java)
    val preferences = preferences(context)
    val existingId = preferences.getString(KEY_RULE_ID, null)
    if (existingId != null && manager.getAutomaticZenRule(existingId) != null) {
      manager.updateAutomaticZenRule(existingId, buildRule(context))
      return existingId
    }
    return manager.addAutomaticZenRule(buildRule(context)).also { id ->
      preferences.edit().putString(KEY_RULE_ID, id).apply()
    }
  }

  private fun buildRule(context: Context): AutomaticZenRule {
    val conditionId = LifeOsQuietConditionProvider.conditionId(context)
    val owner = LifeOsQuietConditionProvider.component(context)
    val policy = ZenPolicy.Builder()
      .disallowAllSounds()
      .allowAlarms(true)
      .allowCalls(ZenPolicy.PEOPLE_TYPE_STARRED)
      .allowRepeatCallers(false)
      .showAllVisualEffects()
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      AutomaticZenRule.Builder(RULE_NAME, conditionId)
        .setOwner(owner)
        .setType(AutomaticZenRule.TYPE_BEDTIME)
        .setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        .setZenPolicy(policy)
        .setEnabled(true)
        .build()
    } else {
      AutomaticZenRule(
        RULE_NAME,
        owner,
        null,
        conditionId,
        policy,
        NotificationManager.INTERRUPTION_FILTER_PRIORITY,
        true,
      )
    }
  }

  private fun publishState(context: Context, ruleId: String, active: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      context.getSystemService(NotificationManager::class.java).setAutomaticZenRuleState(
        ruleId,
        Condition(
          LifeOsQuietConditionProvider.conditionId(context),
          if (active) "Ночной режим LifeOS активен" else "Ночной режим LifeOS неактивен",
          if (active) Condition.STATE_TRUE else Condition.STATE_FALSE,
          Condition.SOURCE_CONTEXT,
        ),
      )
    } else {
      LifeOsQuietConditionProvider.publish(context, active)
    }
  }

  private fun preferences(context: Context) = context.createDeviceProtectedStorageContext()
    .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
