package com.lifeos.desktop

object AlarmDeliveryPolicy {
  fun deliveryKey(occurrenceId: String, isTest: Boolean): String =
    if (isTest) "test:$occurrenceId" else occurrenceId

  fun shouldAccept(previousDeliveryKey: String?, occurrenceId: String, isTest: Boolean): Boolean =
    previousDeliveryKey != deliveryKey(occurrenceId, isTest)
}
