package com.lifeos.desktop

import org.junit.Assert.*
import org.junit.Test

class WakeQrTransactionTest {
  @Test fun failedReplacementKeepsOldKeyAndFile() {
    val files = mutableSetOf("old")
    var key = "old"
    try {
      WakeQrTransaction.replace("old", { files.add("new"); "new" }, { key = it; false }, { files.remove(it) }, {key = "old"; true})
      fail("Commit failure must be reported")
    } catch (_: IllegalStateException) {}
    assertEquals(setOf("old"), files)
    assertEquals("old", key)
    val saved = WakeQrTransaction.replace("old", { files.add("new"); "new" }, { key = it; true }, { files.remove(it) })
    assertEquals("new", saved)
    assertEquals("new", key)
    assertEquals(setOf("new"), files)
  }

  @Test fun creationFailureNeverDeletesPreviousCopy() {
    val deleted = mutableListOf<String>()
    try {
      WakeQrTransaction.replace("old", { error("Write failed") }, { _: String -> true }, { deleted.add(it) })
      fail("Write failure must be reported")
    } catch (_: IllegalStateException) {}
    assertTrue(deleted.isEmpty())
  }

  @Test fun rollbackFailurePreservesBothFilesForRecovery() {
    val files = mutableSetOf("old")
    try {
      WakeQrTransaction.replace("old", {files.add("new"); "new"}, {false}, {files.remove(it)}, {false})
      fail("Failure must be reported")
    } catch (_: IllegalStateException) {}
    assertEquals(setOf("old", "new"), files)
  }
}
