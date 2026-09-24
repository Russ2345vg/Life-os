package com.lifeos.desktop

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.File
import java.security.SecureRandom

data class WakeDismissalSetupStatus(
  val supported: Boolean,
  val qrConfigured: Boolean,
  val emergencyPhraseConfigured: Boolean,
  val qrSavedTo: String?,
  val lastWaterCompletedAtEpochMillis: Long?,
)

class WakeChallengeStore(context: Context) {
  private val storageContext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
    context.createDeviceProtectedStorageContext()
  } else {
    context
  }
  private val preferences = storageContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val random = SecureRandom()
  private val sleepEventStore = LifeOsSleepEventStore(storageContext)

  fun status(): WakeDismissalSetupStatus = WakeDismissalSetupStatus(
    supported = true,
    qrConfigured = preferences.contains(KEY_QR_DIGEST),
    emergencyPhraseConfigured =
      preferences.contains(KEY_PHRASE_SALT) && preferences.contains(KEY_PHRASE_DIGEST),
    qrSavedTo = preferences.getString(KEY_QR_SAVED_TO, null),
    lastWaterCompletedAtEpochMillis =
      preferences.getLong(KEY_LAST_WATER_COMPLETED_AT, 0L).takeIf { it > 0L },
  )

  fun regenerateQr(): WakeDismissalSetupStatus {
    val token = ByteArray(32).also(random::nextBytes)
    val payload = "$QR_PREFIX${Base64.encodeToString(token, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)}"
    preferences.getString(KEY_QR_MEDIA_URI, null)?.let { previous ->
      runCatching { storageContext.contentResolver.delete(Uri.parse(previous), null, null) }
    }
    val saved = saveQrBitmap(payload)
    preferences.edit()
      .putString(KEY_QR_DIGEST, encode(WakeChallengeVerifier.qrDigest(payload)))
      .putString(KEY_QR_SAVED_TO, saved.location)
      .apply {
        if (saved.mediaUri == null) remove(KEY_QR_MEDIA_URI)
        else putString(KEY_QR_MEDIA_URI, saved.mediaUri)
      }
      .apply()
    return status()
  }

  fun saveEmergencyPhrase(phrase: String): WakeDismissalSetupStatus {
    val normalized = WakeChallengeVerifier.normalizePhrase(phrase)
    require(normalized.length >= MINIMUM_PHRASE_LENGTH) {
      "Аварийная фраза должна содержать не меньше $MINIMUM_PHRASE_LENGTH символов."
    }
    val salt = ByteArray(16).also(random::nextBytes)
    val digest = WakeChallengeVerifier.phraseDigest(normalized, salt)
    preferences.edit()
      .putString(KEY_PHRASE_SALT, encode(salt))
      .putString(KEY_PHRASE_DIGEST, encode(digest))
      .apply()
    return status()
  }

  fun matchesQr(payload: String): Boolean {
    if (!payload.startsWith(QR_PREFIX)) return false
    val expected = decode(preferences.getString(KEY_QR_DIGEST, null)) ?: return false
    return WakeChallengeVerifier.matchesQr(payload, expected)
  }

  fun matchesEmergencyPhrase(phrase: String): Boolean {
    val salt = decode(preferences.getString(KEY_PHRASE_SALT, null)) ?: return false
    val expected = decode(preferences.getString(KEY_PHRASE_DIGEST, null)) ?: return false
    return WakeChallengeVerifier.matchesPhrase(phrase, salt, expected)
  }

  fun recordQrDismissal(occurrenceId: String, cycleDate: String) {
    sleepEventStore.recordQrDismissal(occurrenceId, cycleDate)
  }

  fun recordEmergencyReason(
    occurrenceId: String,
    cycleDate: String,
    reason: String?,
    comment: String?,
  ) {
    preferences.edit()
      .putString(KEY_LAST_REASON_OCCURRENCE, occurrenceId)
      .putString(KEY_LAST_REASON, reason?.takeIf(String::isNotBlank))
      .putString(KEY_LAST_REASON_COMMENT, comment?.trim()?.takeIf(String::isNotBlank))
      .putLong(KEY_LAST_REASON_AT, System.currentTimeMillis())
      .apply()
    sleepEventStore.recordEmergencyDismissal(occurrenceId, cycleDate, reason, comment)
  }

  fun recordWater(occurrenceId: String, cycleDate: String) {
    val now = System.currentTimeMillis()
    preferences.edit()
      .putString(KEY_LAST_WATER_OCCURRENCE, occurrenceId)
      .putLong(KEY_LAST_WATER_COMPLETED_AT, now)
      .apply()
    sleepEventStore.recordWater(occurrenceId, cycleDate, now)
  }

  private fun saveQrBitmap(payload: String): SavedQrFile {
    val matrix = QRCodeWriter().encode(
      payload,
      BarcodeFormat.QR_CODE,
      QR_SIZE,
      QR_SIZE,
      mapOf(
        EncodeHintType.CHARACTER_SET to "UTF-8",
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        EncodeHintType.MARGIN to 4,
      ),
    )
    val pixels = IntArray(QR_SIZE * QR_SIZE)
    for (y in 0 until QR_SIZE) {
      for (x in 0 until QR_SIZE) {
        pixels[y * QR_SIZE + x] = if (matrix[x, y]) Color.BLACK else Color.WHITE
      }
    }
    val bitmap = Bitmap.createBitmap(QR_SIZE, QR_SIZE, Bitmap.Config.ARGB_8888).apply {
      setPixels(pixels, 0, QR_SIZE, 0, 0, QR_SIZE, QR_SIZE)
    }
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, QR_FILE_NAME)
          put(MediaStore.Downloads.MIME_TYPE, "image/png")
          put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/LifeOS")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = storageContext.contentResolver.insert(
          MediaStore.Downloads.EXTERNAL_CONTENT_URI,
          values,
        ) ?: error("Не удалось создать файл QR.")
        storageContext.contentResolver.openOutputStream(uri)?.use {
          check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
        } ?: error("Не удалось сохранить QR.")
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        storageContext.contentResolver.update(uri, values, null, null)
        SavedQrFile("Загрузки/LifeOS/$QR_FILE_NAME", uri.toString())
      } else {
        val directory = File(
          storageContext.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
          "LifeOS",
        ).apply { mkdirs() }
        val file = File(directory, QR_FILE_NAME)
        file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        SavedQrFile(file.absolutePath, null)
      }
    } finally {
      bitmap.recycle()
    }
  }

  private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)

  private fun decode(value: String?): ByteArray? = value?.let {
    runCatching { Base64.decode(it, Base64.NO_WRAP) }.getOrNull()
  }

  private companion object {
    const val PREFERENCES = "lifeos-wake-challenge-v1"
    const val QR_PREFIX = "lifeos://wake/"
    const val QR_SIZE = 1024
    const val QR_FILE_NAME = "lifeos-wake-qr.png"
    const val MINIMUM_PHRASE_LENGTH = 16
    const val KEY_QR_DIGEST = "qrDigest"
    const val KEY_QR_SAVED_TO = "qrSavedTo"
    const val KEY_QR_MEDIA_URI = "qrMediaUri"
    const val KEY_PHRASE_SALT = "phraseSalt"
    const val KEY_PHRASE_DIGEST = "phraseDigest"
    const val KEY_LAST_REASON_OCCURRENCE = "lastReasonOccurrence"
    const val KEY_LAST_REASON = "lastReason"
    const val KEY_LAST_REASON_COMMENT = "lastReasonComment"
    const val KEY_LAST_REASON_AT = "lastReasonAt"
    const val KEY_LAST_WATER_OCCURRENCE = "lastWaterOccurrence"
    const val KEY_LAST_WATER_COMPLETED_AT = "lastWaterCompletedAt"
  }
}

private data class SavedQrFile(val location: String, val mediaUri: String?)
