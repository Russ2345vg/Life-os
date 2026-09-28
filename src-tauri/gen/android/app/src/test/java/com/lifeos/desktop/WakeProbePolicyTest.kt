package com.lifeos.desktop

import org.junit.Assert.*
import org.junit.Test

class WakeProbePolicyTest {
  @Test fun confirmationRequiresReceiptForThisProbeAndCurrentFingerprint() {
    val scheduled = WakeProbeEvidence("test-1", 100L, null, null, "sound-a")
    assertFalse(WakeProbePolicy.canConfirm(scheduled, "test-1", "sound-a"))
    val delivered = scheduled.copy(deliveredAtEpochMillis = 120L)
    assertFalse(WakeProbePolicy.canConfirm(delivered, "test-2", "sound-a"))
    assertFalse(WakeProbePolicy.canConfirm(delivered, "test-1", "sound-b"))
    assertTrue(WakeProbePolicy.canConfirm(delivered, "test-1", "sound-a"))
    assertFalse(WakeProbePolicy.isVerified(delivered, "sound-a"))
    assertTrue(WakeProbePolicy.isVerified(delivered.copy(confirmedAtEpochMillis = 130L), "sound-a"))
    assertFalse(WakeProbePolicy.isVerified(delivered.copy(confirmedAtEpochMillis = 130L), "revoked"))
  }

  @Test fun futureOverrideSurvivesBootAndExpiredTimeFallsBackToRegularSchedule() {
    assertEquals(900L, AlarmScheduleMath.restoredTrigger(900L, 800L) { 1500L })
    assertEquals(1500L, AlarmScheduleMath.restoredTrigger(900L, 901L) { 1500L })
  }

  @Test fun expiredEarlyOverrideCannotRingAgainAtRegularTimeTheSameMorning() {
    val storedAt = AlarmScheduleMath.triggerForCycleDate("2026-09-28", "06:30", "Asia/Chita")
    val now = AlarmScheduleMath.triggerForCycleDate("2026-09-28", "06:45", "Asia/Chita")
    assertEquals("2026-09-29", AlarmScheduleMath.restoredCycle("2026-09-28", storedAt, "07:15", "Asia/Chita", now))
    assertEquals("2026-09-28", AlarmScheduleMath.restoredCycle("2026-09-28", storedAt, "07:15", "Asia/Chita", storedAt - 1))
  }

  @Test fun staleTestStopCannotStopARegularAlarm() {
    assertFalse(AlarmDeliveryPolicy.canStop("wake-normal", false, "test-1", true))
    assertTrue(AlarmDeliveryPolicy.canStop("test-1", true, "test-1", true))
    assertFalse(AlarmDeliveryPolicy.canStop("test-2", true, "test-1", true))
  }
}
