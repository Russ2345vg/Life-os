package com.lifeos.desktop

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.system.Os
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

private const val KEY_ALIAS = "com.lifeos.desktop.sync.secure.v1"
private const val STORE_VERSION: Byte = 1
private const val MAX_SECRET_BYTES = 1024 * 1024

@InvokeArg
class SecureWriteArgs {
  lateinit var secretId: String
  lateinit var value: String
  lateinit var aad: String
}

@InvokeArg
class SecureSecretArgs {
  lateinit var secretId: String
  lateinit var aad: String
}

@TauriPlugin
class LifeOsSecureStoragePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun writeSecret(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SecureWriteArgs::class.java)
      validateSecretId(args.secretId)
      val plaintext = Base64.decode(args.value, Base64.DEFAULT)
      require(plaintext.isNotEmpty() && plaintext.size <= MAX_SECRET_BYTES) { "Invalid secure value." }
      val aad = Base64.decode(args.aad, Base64.DEFAULT)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
      cipher.updateAAD(aad)
      val ciphertext = cipher.doFinal(plaintext)
      plaintext.fill(0)
      val blob = ByteBuffer.allocate(2 + cipher.iv.size + ciphertext.size)
        .put(STORE_VERSION)
        .put(cipher.iv.size.toByte())
        .put(cipher.iv)
        .put(ciphertext)
        .array()
      writeAtomic(args.secretId, blob)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("Android secure storage write failed.", "SECURE_STORE_WRITE_FAILED", error)
    }
  }

  @Command
  fun readSecret(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SecureSecretArgs::class.java)
      validateSecretId(args.secretId)
      val file = secretFile(args.secretId)
      val response = JSObject()
      if (!file.exists()) {
        response.put("value", null)
        invoke.resolve(response)
        return
      }
      val store = keyStore()
      require(store.containsAlias(KEY_ALIAS)) { "Secure storage key is unavailable." }
      val blob = file.readBytes()
      require(blob.size in 19..MAX_SECRET_BYTES + 64) { "Invalid secure blob." }
      val buffer = ByteBuffer.wrap(blob)
      require(buffer.get() == STORE_VERSION) { "Unsupported secure blob version." }
      val ivLength = buffer.get().toInt() and 0xff
      require(ivLength == 12 && buffer.remaining() > ivLength + 16) { "Invalid secure blob." }
      val iv = ByteArray(ivLength).also(buffer::get)
      val ciphertext = ByteArray(buffer.remaining()).also(buffer::get)
      val key = store.getKey(KEY_ALIAS, null)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
      cipher.updateAAD(Base64.decode(args.aad, Base64.DEFAULT))
      val plaintext = cipher.doFinal(ciphertext)
      response.put("value", Base64.encodeToString(plaintext, Base64.NO_WRAP))
      plaintext.fill(0)
      invoke.resolve(response)
    } catch (error: Exception) {
      invoke.reject("Android secure storage read failed.", "SECURE_STORE_READ_FAILED", error)
    }
  }

  @Command
  fun deleteSecret(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SecureSecretArgs::class.java)
      validateSecretId(args.secretId)
      val file = secretFile(args.secretId)
      if (file.exists() && !file.delete()) throw IllegalStateException("Secure blob delete failed.")
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("Android secure storage delete failed.", "SECURE_STORE_DELETE_FAILED", error)
    }
  }

  private fun getOrCreateKey(): java.security.Key {
    val store = keyStore()
    if (store.containsAlias(KEY_ALIAS)) return store.getKey(KEY_ALIAS, null)
    val existingBlobs = secureDirectory().listFiles()?.any { it.isFile } == true
    require(!existingBlobs) { "Secure storage key is unavailable for existing data." }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun secureDirectory(): File = File(activity.noBackupFilesDir, "sync-secure").apply {
    require(mkdirs() || isDirectory) { "Secure storage directory is unavailable." }
  }

  private fun secretFile(secretId: String): File = File(secureDirectory(), secretId)

  private fun validateSecretId(secretId: String) {
    require(Regex("^[a-f0-9]{64}$").matches(secretId)) { "Invalid secure storage identifier." }
  }

  private fun writeAtomic(secretId: String, value: ByteArray) {
    val directory = secureDirectory()
    val temporary = File(directory, ".$secretId.tmp")
    val target = File(directory, secretId)
    temporary.outputStream().use { output ->
      output.write(value)
      output.fd.sync()
    }
    Os.rename(temporary.absolutePath, target.absolutePath)
  }
}
