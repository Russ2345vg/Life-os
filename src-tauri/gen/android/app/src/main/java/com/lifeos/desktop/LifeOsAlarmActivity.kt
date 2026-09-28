package com.lifeos.desktop

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LifeOsAlarmActivity : Activity() {
  private val challengeStore by lazy { WakeChallengeStore(this) }
  private var session = WakeDismissalSession()
  private val holdTracker = EmergencyHoldTracker()
  private val handler = Handler(Looper.getMainLooper())
  private var cameraController: QrCameraController? = null
  private var cameraView: TextureView? = null
  private var cameraMessage: TextView? = null
  private var holdProgress: HoldProgressView? = null
  private var holdCompleted = false
  private val occurrenceId: String
    get() = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID) ?: "alarm"
  private val cycleDate: String
    get() = intent.getStringExtra(LifeOsAlarmScheduler.EXTRA_CYCLE_DATE) ?: "test"

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
    window.statusBarColor = BACKGROUND
    window.navigationBarColor = BACKGROUND
    showRinging()
  }

  override fun onResume() {
    super.onResume()
    if (
      session.step == WakeDismissalStep.CAMERA &&
      checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    ) {
      cameraView?.let(::startCamera)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handler.removeCallbacksAndMessages(null)
    holdTracker.release()
    holdCompleted = false
    session = WakeDismissalSession()
    showRinging()
  }

  override fun onPause() {
    cameraController?.stop()
    super.onPause()
  }

  override fun onDestroy() {
    cameraController?.stop()
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    when (session.step) {
      WakeDismissalStep.CAMERA,
      WakeDismissalStep.HOLD,
      WakeDismissalStep.PHRASE,
      -> {
        session.returnToRinging()
        showRinging()
      }
      WakeDismissalStep.REASON -> finishReason(null, null)
      WakeDismissalStep.WATER,
      WakeDismissalStep.RINGING,
      -> Unit
      WakeDismissalStep.COMPLETED -> super.onBackPressed()
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != CAMERA_PERMISSION_REQUEST) return
    if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      showCamera()
    } else {
      showCamera("Камера недоступна. Используйте аварийный путь.")
    }
  }

  private fun showRinging() {
    cameraController?.stop()
    cameraView = null
    val setup = challengeStore.status()
    val body = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setPadding(dp(24), dp(32), dp(24), dp(28))
      addView(spacer(20))
      addView(AlarmPulseView(context), centered(dp(112), dp(112)))
      addView(label(if (isTestAlarm()) "Проверка на этом телефоне" else "Будильник звонит", 14f, ACCENT, true).withTop(24))
      addView(label(currentTime(), 64f, TEXT, false).withTop(12).apply { gravity = Gravity.CENTER })
      addView(label(if (isTestAlarm()) "Слышите сигнал?" else "Пора вставать", 28f, TEXT, true).withTop(2).apply { gravity = Gravity.CENTER })
      addView(label(currentDate(), 14f, MUTED, false).withTop(12))
      addView(spacer(32))
      if (isTestAlarm()) {
        val message = label("Подтвердите, если звук действительно прозвучал. Обычное расписание сохранится.", 14f, MUTED, false).apply { gravity = Gravity.CENTER }
        addView(message.withTop(12))
        addView(primaryButton("Я услышал сигнал") {
          if (LifeOsAlarmScheduler.confirmTestHeard(this@LifeOsAlarmActivity, occurrenceId)) {
            stopSignal()
            showProbeCompleted()
          } else {
            message.text = "Настройки изменились. Повторите проверку из LifeOS."
          }
        }.withTop(24))
        addView(secondaryButton("Закрыть без подтверждения") {
          if (LifeOsAlarmScheduler.isCurrentTest(this@LifeOsAlarmActivity, occurrenceId)) {
            stopSignal()
            finishAndRemoveTask()
          }
        }.withTop(12))
        return@apply
      }
      addView(primaryButton("Сканировать QR") {
        if (setup.qrConfigured) requestCamera() else showSetupMessage()
      })
      addView(secondaryButton("Аварийное отключение") {
        if (setup.emergencyPhraseConfigured) showHold() else showSetupMessage()
      }.withTop(12))
      if (!setup.qrConfigured || !setup.emergencyPhraseConfigured) {
        addView(
          label(
            "Защита подъёма не настроена полностью. Откройте LifeOS после текущего сигнала.",
            12f,
            MUTED,
            false,
          ).apply {
            id = SETUP_MESSAGE_ID
            gravity = Gravity.CENTER
            visibility = View.GONE
          }.withTop(14),
        )
      }
    }
    setScreen("Подъём", if (isTestAlarm()) "Пробный сигнал" else "LifeOS будильник", body)
  }

  private fun showSetupMessage() {
    findViewById<TextView>(SETUP_MESSAGE_ID)?.visibility = View.VISIBLE
  }

  private fun showProbeCompleted() {
    val body = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setPadding(dp(24), dp(48), dp(24), dp(28))
      addView(label("Сигнал проверен", 28f, TEXT, true).apply { gravity = Gravity.CENTER })
      addView(label("Доставка и ваше подтверждение сохранены на этом телефоне.", 16f, MUTED, false).withTop(16))
      addView(primaryButton("Готово") { finishAndRemoveTask() }.withTop(32))
    }
    setScreen("Проверка завершена", "LifeOS", body)
  }

  private fun requestCamera() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
      checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    ) {
      showCamera()
      return
    }
    requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
  }

  private fun showCamera(cameraError: String? = null) {
    session.openCamera()
    val preview = TextureView(this).also { cameraView = it }
    val message = label(
      cameraError ?: "Наведите камеру на распечатанный QR LifeOS",
      14f,
      if (cameraError == null) MUTED else ERROR,
      false,
    ).apply {
      gravity = Gravity.CENTER
      cameraMessage = this
    }
    val frame = FrameLayout(this).apply {
      background = rounded(SURFACE, 18f, LINE)
      clipToOutline = true
      addView(preview, FrameLayout.LayoutParams(MATCH, MATCH))
      addView(ScanFrameView(context), FrameLayout.LayoutParams(MATCH, MATCH))
    }
    val body = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setPadding(dp(18), dp(20), dp(18), dp(24))
      addView(label("Наведите камеру на код", 26f, TEXT, true))
      addView(message.withTop(8))
      addView(frame, LinearLayout.LayoutParams(MATCH, 0, 1f).apply {
        topMargin = dp(22)
        bottomMargin = dp(18)
      })
      addView(label("Галерея недоступна — используется только камера LifeOS", 12f, MUTED, false).apply {
        gravity = Gravity.CENTER
      })
      addView(secondaryButton("QR недоступен") { showHold() }.withTop(14))
    }
    setScreen("Сканировать QR", "Сигнал продолжает звучать", body, scroll = false)
    if (cameraError == null) startCamera(preview)
  }

  private fun startCamera(view: TextureView) {
    cameraController?.stop()
    cameraController = QrCameraController(
      this,
      onQr = { value -> runOnUiThread { onQrRead(value) } },
      onFailure = { message -> runOnUiThread {
        cameraMessage?.apply {
          text = message
          setTextColor(ERROR)
        }
      } },
    ).also { it.start(view) }
  }

  private fun onQrRead(value: String) {
    val matches = challengeStore.matchesQr(value)
    val effect = session.acceptQr(matches)
    if (!matches) {
      cameraMessage?.apply {
        text = "Этот QR не подходит. Попробуйте ещё раз."
        setTextColor(ERROR)
      }
      return
    }
    cameraController?.stop()
    if (effect.stopSignal) stopSignal()
    if (!isTestAlarm()) {
      challengeStore.recordQrDismissal(occurrenceId, cycleDate)
      LifeOsEveningScheduler.finishQuietMode(this, cycleDate)
    }
    showWater()
  }

  private fun showHold() {
    cameraController?.stop()
    session.openEmergencyHold()
    holdTracker.release()
    holdCompleted = false
    val progress = HoldProgressView(this).also { holdProgress = it }
    val button = primaryButton("Удерживать") {}
    button.setOnTouchListener { view, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          holdTracker.start(SystemClock.elapsedRealtime())
          updateHold()
          true
        }
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL,
        -> {
          if (!holdCompleted) {
            holdTracker.release()
            progress.setElapsed(0L)
          }
          view.performClick()
          true
        }
        else -> true
      }
    }
    val body = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setPadding(dp(24), dp(48), dp(24), dp(30))
      addView(label("Будильник активен", 13f, MUTED, false))
      addView(label("Удерживайте кнопку\n20 секунд", 27f, TEXT, true).apply {
        gravity = Gravity.CENTER
      }.withTop(28))
      addView(label("После удержания откроется проверка аварийной фразы", 14f, MUTED, false).apply {
        gravity = Gravity.CENTER
      }.withTop(12))
      addView(progress, centered(dp(206), dp(206)).apply { topMargin = dp(32) })
      addView(label("Если отпустить раньше, отсчёт начнётся заново", 12f, DIM, false).apply {
        gravity = Gravity.CENTER
      }.withTop(18))
      addView(button.withTop(24))
    }
    setScreen("Аварийный путь", "Сигнал продолжает звучать", body)
  }

  private fun updateHold() {
    if (holdCompleted || session.step != WakeDismissalStep.HOLD) return
    val now = SystemClock.elapsedRealtime()
    val elapsed = holdTracker.elapsed(now)
    holdProgress?.setElapsed(elapsed)
    if (holdTracker.isComplete(now)) {
      holdCompleted = true
      holdTracker.release()
      session.finishHold()
      showPhrase()
      return
    }
    handler.postDelayed(::updateHold, 100L)
  }

  private fun showPhrase() {
    val input = SecurePhraseEditText(this).apply {
      hint = "Введите фразу полностью"
      setHintTextColor(DIM)
      setTextColor(TEXT)
      textSize = 16f
      setPadding(dp(16), dp(14), dp(16), dp(14))
      background = rounded(SURFACE, 14f, LINE)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
      imeOptions = EditorInfo.IME_ACTION_DONE or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
      importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
      isLongClickable = false
      setTextIsSelectable(false)
    }
    val message = label("Неверная фраза не остановит сигнал", 12f, DIM, false)
    val body = verticalLayout(Gravity.START).apply {
      setPadding(dp(18), dp(40), dp(18), dp(28))
      addView(label("Последний шаг отключения", 13f, MUTED, true))
      addView(label("Введите сохранённую фразу", 27f, TEXT, true).withTop(8))
      addView(label("Регистр букв не важен", 14f, MUTED, false).withTop(10))
      addView(label("Аварийная фраза", 12f, MUTED, false).withTop(34))
      addView(input, LinearLayout.LayoutParams(MATCH, dp(54)).apply { topMargin = dp(8) })
      addView(message.withTop(10))
      addView(primaryButton("Выключить сигнал") {
        val matches = challengeStore.matchesEmergencyPhrase(input.text.toString())
        val effect = session.acceptEmergencyPhrase(matches)
        if (!matches) {
          message.text = "Фраза не совпала. Сигнал продолжает звучать."
          message.setTextColor(ERROR)
          input.requestFocus()
          return@primaryButton
        }
        if (effect.stopSignal) stopSignal()
        if (!isTestAlarm()) {
          challengeStore.recordEmergencyReason(occurrenceId, cycleDate, null, null)
          LifeOsEveningScheduler.finishQuietMode(this@LifeOsAlarmActivity, cycleDate)
        }
        showReason()
      }.withTop(36))
    }
    setScreen("Аварийная фраза", "Сигнал продолжает звучать", body)
    input.requestFocus()
  }

  private fun showReason() {
    val reasons = listOf(
      "Не дома",
      "QR недоступен",
      "Камера не работает",
      "Техническая проблема",
      "Решил не вставать",
      "Другое",
    )
    val group = RadioGroup(this).apply {
      orientation = RadioGroup.VERTICAL
      reasons.forEach { reason ->
        addView(RadioButton(context).apply {
          text = reason
          tag = reason
          textSize = 15f
          setTextColor(TEXT)
          buttonTintList = android.content.res.ColorStateList.valueOf(ACCENT)
          setPadding(0, dp(8), 0, dp(8))
        }, LinearLayout.LayoutParams(MATCH, dp(46)))
      }
    }
    val comment = EditText(this).apply {
      hint = "Короткий комментарий"
      setHintTextColor(DIM)
      setTextColor(TEXT)
      textSize = 15f
      gravity = Gravity.TOP
      setPadding(dp(14), dp(12), dp(14), dp(12))
      background = rounded(SURFACE, 14f, LINE)
    }
    val body = verticalLayout(Gravity.START).apply {
      setPadding(dp(18), dp(22), dp(18), dp(24))
      addView(label("Сигнал выключен", 13f, ACCENT, true))
      addView(label("Что помешало использовать QR?", 25f, TEXT, true).withTop(10))
      addView(label("Ответ необязателен", 14f, MUTED, false).withTop(8))
      addView(group, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(12) })
      addView(label("Комментарий — необязательно", 12f, MUTED, false).withTop(16))
      addView(comment, LinearLayout.LayoutParams(MATCH, dp(76)).apply { topMargin = dp(8) })
      addView(primaryButton("Сохранить") {
        val selected = group.findViewById<RadioButton>(group.checkedRadioButtonId)?.tag as? String
        finishReason(selected, comment.text.toString())
      }.withTop(20))
      addView(secondaryButton("Пропустить") { finishReason(null, null) }.withTop(10))
    }
    setScreen("Аварийное отключение", "Сигнал выключен", body)
  }

  private fun finishReason(reason: String?, comment: String?) {
    if (!isTestAlarm()) {
      challengeStore.recordEmergencyReason(occurrenceId, cycleDate, reason, comment)
    }
    session.finishReason()
    finishAndRemoveTask()
  }

  private fun showWater() {
    val body = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setPadding(dp(24), dp(68), dp(24), dp(30))
      addView(label("QR принят", 13f, ACCENT, true))
      addView(GlassIconView(context), centered(dp(116), dp(116)).apply { topMargin = dp(30) })
      addView(label("Первый шаг утра", 13f, MUTED, true).withTop(26))
      addView(label("Выпить стакан воды", 28f, TEXT, true).withTop(12))
      addView(label("Подтвердите после того, как выпьете воду", 14f, MUTED, false).apply {
        gravity = Gravity.CENTER
      }.withTop(12))
      addView(spacer(60))
      addView(primaryButton("Я выпил воду") {
        val effect = session.confirmWater()
        if (effect.persistWater && !isTestAlarm()) {
          challengeStore.recordWater(occurrenceId, cycleDate)
        }
        finishAndRemoveTask()
      })
    }
    setScreen("Первый шаг утра", "Сигнал выключен", body)
  }

  private fun stopSignal() {
    startService(Intent(this, LifeOsAlarmRingingService::class.java).apply {
      action = LifeOsAlarmScheduler.ACTION_STOP
      putExtra(LifeOsAlarmScheduler.EXTRA_OCCURRENCE_ID, occurrenceId)
      putExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, isTestAlarm())
    })
  }

  private fun setScreen(title: String, subtitle: String, body: View, scroll: Boolean = true) {
    val page = verticalLayout(Gravity.CENTER_HORIZONTAL).apply {
      setBackgroundColor(BACKGROUND)
      addView(header(title, subtitle), LinearLayout.LayoutParams(MATCH, dp(92)))
      if (scroll) {
        addView(ScrollView(context).apply {
          isFillViewport = true
          overScrollMode = View.OVER_SCROLL_NEVER
          addView(body, ViewGroup.LayoutParams(MATCH, MATCH))
        }, LinearLayout.LayoutParams(MATCH, 0, 1f))
      } else {
        addView(body, LinearLayout.LayoutParams(MATCH, 0, 1f))
      }
    }
    setContentView(page)
  }

  private fun header(title: String, subtitle: String): View = verticalLayout(Gravity.CENTER).apply {
    setPadding(dp(18), dp(14), dp(18), dp(12))
    background = GradientDrawable().apply {
      setColor(BACKGROUND)
      setStroke(dp(1), LINE)
    }
    addView(label(title, 16f, TEXT, true).apply { gravity = Gravity.CENTER })
    addView(label(subtitle, 11f, MUTED, false).apply { gravity = Gravity.CENTER }.withTop(4))
  }

  private fun primaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
    this.text = text
    textSize = 16f
    isAllCaps = false
    setTextColor(Color.rgb(9, 37, 27))
    background = rounded(ACCENT, 12f, ACCENT)
    setOnClickListener { action() }
    minHeight = dp(54)
  }

  private fun secondaryButton(text: String, action: () -> Unit): Button = Button(this).apply {
    this.text = text
    textSize = 15f
    isAllCaps = false
    setTextColor(TEXT)
    background = rounded(SURFACE, 12f, LINE_STRONG)
    setOnClickListener { action() }
    minHeight = dp(52)
  }

  private fun label(text: String, size: Float, color: Int, bold: Boolean): TextView =
    TextView(this).apply {
      this.text = text
      textSize = size
      setTextColor(color)
      typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

  private fun verticalLayout(gravityValue: Int): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = gravityValue
  }

  private fun rounded(fill: Int, radius: Float, stroke: Int): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(radius.toInt()).toFloat()
      setColor(fill)
      setStroke(dp(1), stroke)
    }

  private fun spacer(height: Int): View = View(this).apply {
    layoutParams = LinearLayout.LayoutParams(1, dp(height))
  }

  private fun <T : View> T.withTop(value: Int): T = apply {
    layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(value) }
  }

  private fun centered(width: Int, height: Int): LinearLayout.LayoutParams =
    LinearLayout.LayoutParams(width, height).apply { gravity = Gravity.CENTER_HORIZONTAL }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun currentTime(): String = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

  private fun currentDate(): String =
    SimpleDateFormat("EEEE, d MMMM", Locale("ru")).format(Date()).replaceFirstChar {
      if (it.isLowerCase()) it.titlecase(Locale("ru")) else it.toString()
    }

  private fun isTestAlarm(): Boolean =
    intent.getBooleanExtra(LifeOsAlarmScheduler.EXTRA_IS_TEST, false)

  private companion object {
    const val CAMERA_PERMISSION_REQUEST = 47_108
    const val SETUP_MESSAGE_ID = 47_109
    const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    val BACKGROUND: Int = Color.rgb(11, 16, 18)
    val SURFACE: Int = Color.rgb(17, 24, 27)
    val LINE: Int = Color.rgb(40, 52, 56)
    val LINE_STRONG: Int = Color.rgb(80, 98, 104)
    val TEXT: Int = Color.rgb(238, 243, 242)
    val MUTED: Int = Color.rgb(178, 191, 190)
    val DIM: Int = Color.rgb(149, 165, 165)
    val ACCENT: Int = Color.rgb(129, 207, 171)
    val ERROR: Int = Color.rgb(240, 154, 154)
  }
}

private class SecurePhraseEditText(context: android.content.Context) : EditText(context) {
  override fun onTextContextMenuItem(id: Int): Boolean = false
}

private class AlarmPulseView(context: android.content.Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val radius = minOf(width, height) / 2f
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = radius * 0.018f
    paint.color = Color.rgb(50, 83, 68)
    canvas.drawCircle(cx, cy, radius * 0.96f, paint)
    paint.color = Color.rgb(35, 58, 48)
    canvas.drawCircle(cx, cy, radius * 0.78f, paint)
    paint.style = Paint.Style.FILL
    paint.color = Color.rgb(27, 52, 43)
    canvas.drawCircle(cx, cy, radius * 0.58f, paint)
    paint.color = Color.rgb(129, 207, 171)
    paint.textAlign = Paint.Align.CENTER
    paint.textSize = radius * 0.34f
    paint.typeface = Typeface.DEFAULT_BOLD
    canvas.drawText("◷", cx, cy + paint.textSize * 0.34f, paint)
  }
}

private class ScanFrameView(context: android.content.Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(129, 207, 171)
    style = Paint.Style.STROKE
    strokeWidth = resources.displayMetrics.density * 2f
    strokeCap = Paint.Cap.ROUND
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val size = minOf(width, height) * 0.68f
    val left = (width - size) / 2f
    val top = (height - size) / 2f
    val segment = size * 0.18f
    val right = left + size
    val bottom = top + size
    canvas.drawLine(left, top, left + segment, top, paint)
    canvas.drawLine(left, top, left, top + segment, paint)
    canvas.drawLine(right, top, right - segment, top, paint)
    canvas.drawLine(right, top, right, top + segment, paint)
    canvas.drawLine(left, bottom, left + segment, bottom, paint)
    canvas.drawLine(left, bottom, left, bottom - segment, paint)
    canvas.drawLine(right, bottom, right - segment, bottom, paint)
    canvas.drawLine(right, bottom, right, bottom - segment, paint)
  }
}

private class HoldProgressView(context: android.content.Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var elapsedMillis = 0L

  fun setElapsed(value: Long) {
    elapsedMillis = value.coerceIn(0L, 20_000L)
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val inset = resources.displayMetrics.density * 8f
    val bounds = RectF(inset, inset, width - inset, height - inset)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = resources.displayMetrics.density * 8f
    paint.strokeCap = Paint.Cap.ROUND
    paint.color = Color.rgb(40, 52, 56)
    canvas.drawArc(bounds, -90f, 360f, false, paint)
    paint.color = Color.rgb(129, 207, 171)
    canvas.drawArc(bounds, -90f, 360f * elapsedMillis / 20_000f, false, paint)
    paint.style = Paint.Style.FILL
    paint.textAlign = Paint.Align.CENTER
    paint.color = Color.WHITE
    paint.textSize = resources.displayMetrics.scaledDensity * 42f
    val seconds = (elapsedMillis / 1_000L).coerceAtMost(20L)
    canvas.drawText(seconds.toString(), width / 2f, height / 2f + paint.textSize * 0.25f, paint)
    paint.color = Color.rgb(149, 165, 165)
    paint.textSize = resources.displayMetrics.scaledDensity * 12f
    canvas.drawText("из 20 секунд", width / 2f, height / 2f + resources.displayMetrics.density * 42f, paint)
  }
}

private class GlassIconView(context: android.content.Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(129, 207, 171)
    strokeWidth = resources.displayMetrics.density * 2f
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val scale = minOf(width, height).toFloat()
    val left = scale * 0.38f
    val right = scale * 0.62f
    val top = scale * 0.30f
    val bottom = scale * 0.70f
    canvas.drawLine(left, top, right, top, paint)
    canvas.drawLine(left, top, left + scale * 0.04f, bottom, paint)
    canvas.drawLine(right, top, right - scale * 0.04f, bottom, paint)
    canvas.drawLine(left + scale * 0.04f, bottom, right - scale * 0.04f, bottom, paint)
    canvas.drawLine(left + scale * 0.025f, scale * 0.50f, right - scale * 0.025f, scale * 0.50f, paint)
  }
}
