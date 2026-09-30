package com.lifeos.desktop

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SpeechRecognitionArgs {
  lateinit var language: String
}

@TauriPlugin
class LifeOsSpeechPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun recognize(invoke: Invoke) {
    try {
      val language = invoke.parseArgs(SpeechRecognitionArgs::class.java).language
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PROMPT, "Говорите — LifeOS добавит текст")
      }
      startActivityForResult(invoke, intent, "onRecognitionResult")
    } catch (error: ActivityNotFoundException) {
      invoke.reject(
        "Speech recognition service is unavailable.",
        "SPEECH_UNAVAILABLE",
        error,
      )
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Speech recognition failed.", "SPEECH_FAILED", error)
    }
  }

  @ActivityCallback
  private fun onRecognitionResult(invoke: Invoke, result: ActivityResult) {
    if (result.resultCode != Activity.RESULT_OK) {
      invoke.reject("Speech recognition cancelled.", "SPEECH_ABORTED")
      return
    }
    val transcript = result.data
      ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
      ?.firstOrNull()
      ?.trim()
      .orEmpty()
    if (transcript.isEmpty()) {
      invoke.reject("No speech was recognized.", "SPEECH_EMPTY")
      return
    }
    invoke.resolve(JSObject().apply { put("transcript", transcript) })
  }
}
