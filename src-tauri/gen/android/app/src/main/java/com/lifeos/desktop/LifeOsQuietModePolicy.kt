package com.lifeos.desktop

enum class QuietCallAudience {
  STARRED,
}

data class QuietModePolicySpecification(
  val allowAlarms: Boolean,
  val callAudience: QuietCallAudience,
  val allowRepeatCallers: Boolean,
)

object LifeOsQuietModePolicy {
  fun specification() = QuietModePolicySpecification(
    allowAlarms = true,
    callAudience = QuietCallAudience.STARRED,
    allowRepeatCallers = false,
  )
}
