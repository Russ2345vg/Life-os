; Cleanup is scoped inside the executable to this user's LifeOS-Walk task prefix.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    ; Copy before the cancellable app check; do not change the queue on cancellation.
    InitPluginsDir
    CopyFiles /SILENT "$INSTDIR\${MAINBINARYNAME}.exe" "$PLUGINSDIR\lifeos-walk-cleanup.exe"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::ExecToLog '"$PLUGINSDIR\lifeos-walk-cleanup.exe" --walk-reminder-remove'
    Pop $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog '"$INSTDIR\${MAINBINARYNAME}.exe" --walk-reminder-maintain'
  Pop $0
!macroend
