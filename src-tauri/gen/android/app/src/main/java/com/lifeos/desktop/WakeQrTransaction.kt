package com.lifeos.desktop

/** Keep the previous usable QR until both the new file and its verifier are durable. */
object WakeQrTransaction {
  fun <T> replace(previous: T?, create: () -> T, commit: (T) -> Boolean, discard: (T) -> Unit, rollback: () -> Boolean = { true }): T {
    val saved = create()
    try {
      check(commit(saved)) { "Не удалось сохранить новый ключ QR. Прежний QR остаётся действительным." }
    } catch (error: Exception) {
      if (runCatching { rollback() }.getOrDefault(false)) runCatching { discard(saved) }
      throw error
    }
    if (previous != null && previous != saved) runCatching { discard(previous) }
    return saved
  }
}
