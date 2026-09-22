package com.lifeos.desktop

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class LifeOsAlarmActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(content())
  }

  private fun content(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    setPadding(48, 72, 48, 72)
    setBackgroundColor(Color.rgb(7, 11, 11))

    addView(TextView(context).apply {
      text = if (intent.getBooleanExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, false)) {
        "Пробный будильник"
      } else {
        "Время подъёма"
      }
      textSize = 32f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
    })
    addView(TextView(context).apply {
      text = "LifeOS"
      textSize = 18f
      setTextColor(Color.rgb(155, 166, 166))
      gravity = Gravity.CENTER
      setPadding(0, 16, 0, 48)
    })
    addView(Button(context).apply {
      text = "Остановить сигнал"
      textSize = 18f
      setTextColor(Color.BLACK)
      setBackgroundColor(Color.rgb(65, 232, 105))
      setPadding(48, 20, 48, 20)
      setOnClickListener {
        startService(Intent(context, LifeOsAlarmRingingService::class.java).apply {
          action = LifeOsAlarmScheduler.ACTION_STOP
        })
        finishAndRemoveTask()
      }
    })
  }
}
