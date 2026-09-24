package com.lifeos.desktop

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeDismissalPolicyTest {
  @Test
  fun acceptsOnlyTheRegisteredQrPayload() {
    val digest = WakeChallengeVerifier.qrDigest("lifeos://wake/registered")

    assertFalse(WakeChallengeVerifier.matchesQr("lifeos://wake/wrong", digest))
    assertTrue(WakeChallengeVerifier.matchesQr("lifeos://wake/registered", digest))
  }

  @Test
  fun emergencyPhraseIsCaseInsensitiveAndWhitespaceStable() {
    val salt = ByteArray(16) { it.toByte() }
    val digest = WakeChallengeVerifier.phraseDigest("  Моя   Длинная Фраза  ", salt)

    assertTrue(WakeChallengeVerifier.matchesPhrase("моя длинная фраза", salt, digest))
    assertFalse(WakeChallengeVerifier.matchesPhrase("другая длинная фраза", salt, digest))
  }

  @Test
  fun holdShorterThanTwentySecondsResets() {
    val hold = EmergencyHoldTracker(requiredMillis = 20_000L)

    hold.start(1_000L)
    assertFalse(hold.isComplete(20_999L))
    hold.release()

    assertEquals(0L, hold.elapsed(25_000L))
    assertFalse(hold.isComplete(25_000L))
  }

  @Test
  fun holdAtLeastTwentySecondsCompletes() {
    val hold = EmergencyHoldTracker(requiredMillis = 20_000L)

    hold.start(1_000L)

    assertTrue(hold.isComplete(21_000L))
  }

  @Test
  fun successfulQrStopsOnceAndWaterNeverRestartsTheSignal() {
    val session = WakeDismissalSession()

    assertTrue(session.acceptQr(matches = true).stopSignal)
    assertFalse(session.acceptQr(matches = true).stopSignal)
    assertEquals(WakeDismissalStep.WATER, session.step)

    val confirmation = session.confirmWater()

    assertTrue(confirmation.persistWater)
    assertFalse(confirmation.stopSignal)
    assertEquals(WakeDismissalStep.COMPLETED, session.step)
  }

  @Test
  fun invalidQrAndPhraseKeepTheSignalActive() {
    val session = WakeDismissalSession()

    assertFalse(session.acceptQr(matches = false).stopSignal)
    assertFalse(session.acceptEmergencyPhrase(matches = false).stopSignal)
    assertFalse(session.signalStopped)
  }

  @Test
  fun emergencyReasonCanBeSkippedWithoutRestartingTheSignal() {
    val session = WakeDismissalSession()

    assertTrue(session.acceptEmergencyPhrase(matches = true).stopSignal)
    assertEquals(WakeDismissalStep.REASON, session.step)

    val result = session.finishReason()

    assertFalse(result.stopSignal)
    assertEquals(WakeDismissalStep.COMPLETED, session.step)
    assertTrue(session.signalStopped)
  }
}
