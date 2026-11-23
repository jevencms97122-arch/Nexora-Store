; Desktop shortcuts redirected through the store get their real target back
; before the store is removed, so they keep working without it.
!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\nexora-store.exe" --restore-shortcuts'
!macroend
