package com.lifeos.desktop

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.service.notification.Condition
import android.service.notification.ConditionProviderService

class LifeOsQuietConditionProvider : ConditionProviderService() {
  override fun onConnected() {
    instance = this
    publishCurrentState()
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onSubscribe(conditionId: Uri?) = publishCurrentState()

  override fun onUnsubscribe(conditionId: Uri?) = Unit

  private fun publishCurrentState() {
    notifyCondition(condition(this, LifeOsQuietModeController.isActiveRequested(this)))
  }

  companion object {
    private var instance: LifeOsQuietConditionProvider? = null

    fun component(context: Context) = ComponentName(context, LifeOsQuietConditionProvider::class.java)

    fun conditionId(context: Context): Uri = Condition.newId(context)
      .appendPath("lifeos-night")
      .build()

    fun publish(context: Context, active: Boolean) {
      val provider = instance
      if (provider == null) {
        requestRebind(component(context))
      } else {
        provider.notifyCondition(condition(context, active))
      }
    }

    private fun condition(context: Context, active: Boolean) = Condition(
      conditionId(context),
      if (active) "Ночной режим LifeOS активен" else "Ночной режим LifeOS неактивен",
      if (active) Condition.STATE_TRUE else Condition.STATE_FALSE,
      Condition.SOURCE_CONTEXT,
    )
  }
}
