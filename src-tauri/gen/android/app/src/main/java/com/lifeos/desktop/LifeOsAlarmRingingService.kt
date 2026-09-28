package com.lifeos.desktop

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat

class LifeOsAlarmRingingService : Service() {
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var vibrator: Vibrator? = null
  private var activeOccurrenceId: String? = null
  private var activeIsTest = false

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == LifeOsAlarmScheduler.ACTION_STOP) {
      val expectedId = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID)
      val expectedIsTest = intent.getBooleanExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, false)
      if (!AlarmDeliveryPolicy.canStop(activeOccurrenceId, activeIsTest, expectedId, expectedIsTest) ||
        expectedId == null || !LifeOsAlarmScheduler.matchesCurrentDelivery(this, expectedId, expectedIsTest)) return START_NOT_STICKY
      stopSignal()
      return START_NOT_STICKY
    }
    if (intent?.action != LifeOsAlarmScheduler.ACTION_RING) return START_NOT_STICKY
    val occurrenceId = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID) ?: "alarm"
    val cycleDate = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_CYCLE_DATE) ?: "test"
    val soundTitle =
      intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_SOUND_TITLE) ?: "Системный сигнал"
    val isTest = intent.getBooleanExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, false)
    activeOccurrenceId = occurrenceId
    activeIsTest = isTest
    startForeground(NOTIFICATION_ID, notification(occurrenceId, cycleDate, soundTitle, isTest))
    if (player?.isPlaying != true) {
      acquireWakeLock()
      startVibration()
      startAudio(intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_SOUND_URI))
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    releaseSignal()
    super.onDestroy()
  }

  private fun startAudio(soundUri: String?) {
    val uri = soundUri?.let(Uri::parse)
      ?: RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    player = MediaPlayer().apply {
      setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      setDataSource(applicationContext, uri)
      isLooping = true
      setOnPreparedListener { it.start() }
      setOnErrorListener { _, _, _ ->
        stopSignal()
        true
      }
      prepareAsync()
    }
  }

  private fun acquireWakeLock() {
    val manager = getSystemService(PowerManager::class.java)
    wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifeOS:WakeAlarm").apply {
      acquire(30 * 60 * 1_000L)
    }
  }

  @Suppress("DEPRECATION")
  private fun startVibration() {
    vibrator = getSystemService(Vibrator::class.java)
    val pattern = longArrayOf(0, 700, 500)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      vibrator?.vibrate(pattern, 0)
    }
  }

  private fun notification(
    occurrenceId: String,
    cycleDate: String,
    soundTitle: String,
    isTest: Boolean,
  ) =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(if (isTest) "Пробный будильник LifeOS" else "Время подъёма")
      .setContentText(soundTitle)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(alarmActivityIntent(occurrenceId, cycleDate, isTest))
      .setFullScreenIntent(alarmActivityIntent(occurrenceId, cycleDate, isTest), true)
      .build()

  private fun alarmActivityIntent(
    occurrenceId: String,
    cycleDate: String,
    isTest: Boolean,
  ): PendingIntent =
    PendingIntent.getActivity(
      this,
      47_104,
      Intent(this, LifeOsAlarmActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID, occurrenceId)
        putExtra(LifeOsAlarmScheduler.EXTRA_CYCLE_DATE, cycleDate)
        putExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, isTest)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Будильник LifeOS",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Системный сигнал подъёма LifeOS"
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun stopSignal() {
    activeOccurrenceId = null
    releaseSignal()
    LifeOsAlarmScheduler.markRinging(this, false)
    LifeOsAlarmScheduler.cancelTest(this)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun releaseSignal() {
    player?.runCatching {
      if (isPlaying) stop()
      release()
    }
    player = null
    vibrator?.cancel()
    vibrator = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
  }

  private companion object {
    const val CHANNEL_ID = "lifeos-wake-alarm"
    const val NOTIFICATION_ID = 47_100
  }
}
