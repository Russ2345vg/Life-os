package com.lifeos.desktop

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

private const val LIFEOS_PACKAGE_ID = "com.lifeos.desktop"
private const val MAX_MANIFEST_BYTES = 256 * 1024

@InvokeArg
class CheckUpdateArgs {
  lateinit var endpoint: String
}

@InvokeArg
class AndroidUpdateArgs {
  lateinit var version: String
  var versionCode: Long = 0
  lateinit var notes: String
  lateinit var apkUrl: String
  lateinit var sha256: String
  lateinit var packageId: String
}

@InvokeArg
class DownloadAndInstallArgs {
  lateinit var update: AndroidUpdateArgs
}

@TauriPlugin
class AndroidUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun checkUpdate(invoke: Invoke) {
    val args = invoke.parseArgs(CheckUpdateArgs::class.java)
    Thread {
      try {
        validateManifestEndpoint(args.endpoint)
        val manifest = JSONObject(readLimitedHttps(args.endpoint, MAX_MANIFEST_BYTES))
        val packageId = manifest.getString("packageId")
        val version = manifest.getString("version")
        val versionCode = manifest.getLong("versionCode")
        val apkUrl = manifest.getString("apkUrl")
        val sha256 = manifest.getString("sha256").lowercase()
        val notes = manifest.optString("notes", "")

        require(packageId == LIFEOS_PACKAGE_ID) { "Android manifest packageId does not match LifeOS." }
        require(Regex("^[0-9]+\\.[0-9]+\\.[0-9]+$").matches(version)) { "Invalid Android update version." }
        require(Regex("^[a-f0-9]{64}$").matches(sha256)) { "Invalid Android APK SHA-256." }
        validateApkUrl(apkUrl)

        val currentCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          activity.packageManager.getPackageInfo(activity.packageName, 0).longVersionCode
        } else {
          @Suppress("DEPRECATION")
          activity.packageManager.getPackageInfo(activity.packageName, 0).versionCode.toLong()
        }
        if (versionCode <= currentCode) {
          invoke.resolve()
          return@Thread
        }

        val result = JSObject()
        result.put("version", version)
        result.put("versionCode", versionCode)
        result.put("notes", notes)
        result.put("apkUrl", apkUrl)
        result.put("sha256", sha256)
        result.put("packageId", packageId)
        invoke.resolve(result)
      } catch (error: Exception) {
        invoke.reject(error.message ?: "Android update check failed.", "UPDATE_CHECK_FAILED", error)
      }
    }.start()
  }

  @Command
  fun downloadAndInstall(invoke: Invoke) {
    val args = invoke.parseArgs(DownloadAndInstallArgs::class.java)
    Thread {
      var partialFile: File? = null
      try {
        val update = args.update
        require(update.packageId == LIFEOS_PACKAGE_ID) { "Android update packageId does not match LifeOS." }
        require(Regex("^[a-fA-F0-9]{64}$").matches(update.sha256)) { "Invalid Android APK SHA-256." }
        validateApkUrl(update.apkUrl)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !activity.packageManager.canRequestPackageInstalls()
        ) {
          val settingsIntent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}"),
          )
          activity.runOnUiThread { activity.startActivity(settingsIntent) }
          invoke.reject(
            "Разрешите LifeOS устанавливать неизвестные приложения и нажмите «Обновить» ещё раз.",
            "UNKNOWN_SOURCES_PERMISSION_REQUIRED",
          )
          return@Thread
        }

        val updateDirectory = File(activity.cacheDir, "updates").apply { mkdirs() }
        require(updateDirectory.isDirectory) { "Cannot create the Android update cache directory." }
        partialFile = File(updateDirectory, "LifeOS_${update.version}.apk.part")
        val apkFile = File(updateDirectory, "LifeOS_${update.version}.apk")
        partialFile.delete()
        apkFile.delete()

        val digest = MessageDigest.getInstance("SHA-256")
        val connection = openHttps(update.apkUrl)
        connection.inputStream.use { input ->
          partialFile.outputStream().buffered().use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              digest.update(buffer, 0, count)
              output.write(buffer, 0, count)
            }
          }
        }
        connection.disconnect()

        val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
        if (!actualSha256.equals(update.sha256, ignoreCase = true)) {
          partialFile.delete()
          throw SecurityException("SHA-256 APK не совпадает. Установщик не запущен.")
        }
        require(partialFile.renameTo(apkFile)) { "Cannot finalize the downloaded Android APK." }

        val contentUri = FileProvider.getUriForFile(
          activity,
          "${activity.packageName}.fileprovider",
          apkFile,
        )
        val installer = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(contentUri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.runOnUiThread {
          activity.startActivity(installer)
          val result = JSObject()
          result.put("installerOpened", true)
          invoke.resolve(result)
        }
      } catch (error: Exception) {
        partialFile?.delete()
        invoke.reject(error.message ?: "Android update failed.", "UPDATE_INSTALL_FAILED", error)
      }
    }.start()
  }

  private fun validateManifestEndpoint(value: String) {
    val url = URL(value)
    require(url.protocol == "https") { "Android update endpoint must use HTTPS." }
    require(url.host.equals("github.com", ignoreCase = true)) { "Android update endpoint must use GitHub Releases." }
    require(Regex("^/[^/]+/LifeOS-Releases/releases/latest/download/android-latest\\.json$").matches(url.path)) {
      "Android update endpoint is not the LifeOS release channel."
    }
  }

  private fun validateApkUrl(value: String) {
    val url = URL(value)
    require(url.protocol == "https") { "Android APK URL must use HTTPS." }
    require(url.host.equals("github.com", ignoreCase = true)) { "Android APK must come from GitHub Releases." }
    require(Regex("^/[^/]+/LifeOS-Releases/releases/download/v[^/]+/LifeOS_[^/]+_android_release\\.apk$").matches(url.path)) {
      "Android APK URL is not a LifeOS release asset."
    }
  }

  private fun readLimitedHttps(value: String, maxBytes: Int): String {
    val connection = openHttps(value)
    return connection.inputStream.use { input ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      var total = 0
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        total += count
        require(total <= maxBytes) { "Android update manifest is too large." }
        output.write(buffer, 0, count)
      }
      output.toString(Charsets.UTF_8.name())
    }.also { connection.disconnect() }
  }

  private fun openHttps(value: String): HttpURLConnection {
    val connection = URL(value).openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = 15_000
    connection.readTimeout = 60_000
    connection.requestMethod = "GET"
    connection.setRequestProperty("Accept", "application/octet-stream, application/json")
    connection.connect()
    if (connection.responseCode !in 200..299) {
      val responseCode = connection.responseCode
      connection.disconnect()
      throw IOException("GitHub Releases returned HTTP $responseCode.")
    }
    val finalUrl = connection.url
    require(finalUrl.protocol == "https") { "GitHub redirect left HTTPS." }
    val allowedHosts = setOf(
      "github.com",
      "objects.githubusercontent.com",
      "release-assets.githubusercontent.com",
    )
    require(allowedHosts.any { finalUrl.host.equals(it, ignoreCase = true) }) {
      "GitHub redirect host is not allowed."
    }
    return connection
  }
}
