package com.lifeos.desktop

object AlarmDeliveryPolicy {
  fun canStop(currentId: String?, currentIsTest: Boolean, expectedId: String?, expectedIsTest: Boolean): Boolean =
    currentId != null && expectedId != null && currentId == expectedId && currentIsTest == expectedIsTest
  fun deliveryKey(occurrenceId: String, isTest: Boolean): String =
    if (isTest) "test:$occurrenceId" else occurrenceId

  fun shouldAccept(previousDeliveryKey: String?, occurrenceId: String, isTest: Boolean): Boolean =
    previousDeliveryKey != deliveryKey(occurrenceId, isTest)
}
