package com.lifeos.desktop

data class WakeProbeEvidence(
  val occurrenceId: String,
  val scheduledAtEpochMillis: Long,
  val deliveredAtEpochMillis: Long?,
  val confirmedAtEpochMillis: Long?,
  val fingerprint: String,
)

object WakeProbePolicy {
  fun canConfirm(evidence: WakeProbeEvidence?, occurrenceId: String, fingerprint: String): Boolean =
    evidence != null && evidence.occurrenceId == occurrenceId &&
      evidence.deliveredAtEpochMillis != null && evidence.fingerprint == fingerprint

  fun isVerified(evidence: WakeProbeEvidence?, fingerprint: String): Boolean =
    evidence != null && evidence.deliveredAtEpochMillis != null &&
      evidence.confirmedAtEpochMillis != null && evidence.fingerprint == fingerprint
}
