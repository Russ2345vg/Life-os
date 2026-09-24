package com.lifeos.desktop

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object WakeChallengeVerifier {
  private const val PHRASE_ITERATIONS = 120_000
  private const val PHRASE_KEY_BITS = 256

  fun qrDigest(payload: String): ByteArray =
    MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(StandardCharsets.UTF_8))

  fun matchesQr(payload: String, expectedDigest: ByteArray): Boolean =
    MessageDigest.isEqual(qrDigest(payload), expectedDigest)

  fun normalizePhrase(phrase: String): String =
    phrase.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")

  fun phraseDigest(phrase: String, salt: ByteArray): ByteArray {
    val normalized = normalizePhrase(phrase)
    val spec = PBEKeySpec(normalized.toCharArray(), salt, PHRASE_ITERATIONS, PHRASE_KEY_BITS)
    return try {
      SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    } finally {
      spec.clearPassword()
    }
  }

  fun matchesPhrase(phrase: String, salt: ByteArray, expectedDigest: ByteArray): Boolean =
    MessageDigest.isEqual(phraseDigest(phrase, salt), expectedDigest)
}

class EmergencyHoldTracker(private val requiredMillis: Long = 20_000L) {
  private var startedAtMillis: Long? = null

  fun start(nowMillis: Long) {
    if (startedAtMillis == null) startedAtMillis = nowMillis
  }

  fun release() {
    startedAtMillis = null
  }

  fun elapsed(nowMillis: Long): Long =
    startedAtMillis?.let { (nowMillis - it).coerceAtLeast(0L) } ?: 0L

  fun isComplete(nowMillis: Long): Boolean = elapsed(nowMillis) >= requiredMillis
}

enum class WakeDismissalStep {
  RINGING,
  CAMERA,
  HOLD,
  PHRASE,
  REASON,
  WATER,
  COMPLETED,
}

data class WakeDismissalEffect(
  val stopSignal: Boolean = false,
  val persistWater: Boolean = false,
)

class WakeDismissalSession {
  var step: WakeDismissalStep = WakeDismissalStep.RINGING
    private set

  var signalStopped: Boolean = false
    private set

  fun openCamera() {
    if (!signalStopped) step = WakeDismissalStep.CAMERA
  }

  fun openEmergencyHold() {
    if (!signalStopped) step = WakeDismissalStep.HOLD
  }

  fun returnToRinging() {
    if (!signalStopped) step = WakeDismissalStep.RINGING
  }

  fun finishHold() {
    if (!signalStopped && step == WakeDismissalStep.HOLD) step = WakeDismissalStep.PHRASE
  }

  fun acceptQr(matches: Boolean): WakeDismissalEffect {
    if (!matches || signalStopped) return WakeDismissalEffect()
    signalStopped = true
    step = WakeDismissalStep.WATER
    return WakeDismissalEffect(stopSignal = true)
  }

  fun acceptEmergencyPhrase(matches: Boolean): WakeDismissalEffect {
    if (!matches || signalStopped) return WakeDismissalEffect()
    signalStopped = true
    step = WakeDismissalStep.REASON
    return WakeDismissalEffect(stopSignal = true)
  }

  fun finishReason(): WakeDismissalEffect {
    if (step == WakeDismissalStep.REASON) step = WakeDismissalStep.COMPLETED
    return WakeDismissalEffect()
  }

  fun confirmWater(): WakeDismissalEffect {
    if (step != WakeDismissalStep.WATER) return WakeDismissalEffect()
    step = WakeDismissalStep.COMPLETED
    return WakeDismissalEffect(persistWater = true)
  }
}
