; ===================================================================
; installer.nsh — Custom NSIS installer options for Persephone
; ===================================================================
;
; Adds a custom page after directory selection with checkboxes:
;   1. Create desktop shortcut                        (checked by default)
;   2. Create Start menu shortcut                     (checked by default)
;   3. "Open with persephone" for files               (checked by default)
;   4. "Open with persephone" for folders             (checked by default)
;   5. Register as default browser                    (unchecked by default)
;
; Selected options are persisted to the registry so the uninstaller
; (and future upgrades) know exactly what to clean up.
;
; Registry root: HKCU\Software\persephone\Install
;
; --- Retired option: "Set as default app for text files" ------------
; Persephone claims no file extensions any more. It opens essentially
; anything — and what it cannot open natively, an installable board or a
; user-built viewer can — so owning a fixed list of extensions was both
; arbitrary and a land-grab on handlers the user did not ask us to take.
;
; The registration code is deliberately KEPT, minus its checkbox: $OptTextFiles
; is now forced unchecked, which drives customInstall down the ${Else} branch
; and RELEASES the associations (restoring each extension's previous handler
; from PrevAssoc). Deleting the macros instead would strand anyone who ticked
; the old box — permanently associated, with no installer path back.
; ===================================================================

!include "nsDialogs.nsh"

; --- Variables (installer only — the uninstaller reads from the registry) --
!ifndef BUILD_UNINSTALLER
Var hChkDesktop
Var hChkStartMenu
Var hChkContextMenu
Var hChkFolderMenu
Var hChkBrowser
Var OptDesktop
Var OptStartMenu
Var OptContextMenu
Var OptFolderMenu
Var OptTextFiles    ; no checkbox — always unchecked, see the retired-option note above
Var OptBrowser
!endif

; ========================================================================
; Helper macros – file association register / unregister
; ========================================================================

!macro _RegisterFileAssoc EXT
    ; Save the current default handler so we can restore it on uninstall.
    ClearErrors
    ReadRegStr $R0 HKCU "Software\Classes\.${EXT}" ""
    ${If} $R0 != "Persephone.Document"
        ; Only save if it wasn't already ours (avoids clobbering the backup).
        WriteRegStr HKCU "Software\persephone\Install\PrevAssoc" ".${EXT}" $R0
    ${EndIf}
    WriteRegStr HKCU "Software\Classes\.${EXT}" "" "Persephone.Document"
!macroend

!macro _UnRegisterFileAssoc EXT
    ; Only touch the extension if we currently own it.
    ReadRegStr $R0 HKCU "Software\Classes\.${EXT}" ""
    ${If} $R0 == "Persephone.Document"
        ClearErrors
        ReadRegStr $R1 HKCU "Software\persephone\Install\PrevAssoc" ".${EXT}"
        ${If} ${Errors}
            DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
        ${ElseIf} $R1 != ""
            WriteRegStr HKCU "Software\Classes\.${EXT}" "" $R1
        ${Else}
            DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
        ${EndIf}
    ${EndIf}
!macroend

; ========================================================================
; customInit — read previously stored selections (upgrade-aware defaults)
; ========================================================================

!macro customInit
    ClearErrors
    ReadRegDWORD $OptDesktop HKCU "Software\persephone\Install" "Desktop"
    ${If} ${Errors}
        StrCpy $OptDesktop ${BST_CHECKED}       ; first install → checked
    ${EndIf}

    ClearErrors
    ReadRegDWORD $OptStartMenu HKCU "Software\persephone\Install" "StartMenu"
    ${If} ${Errors}
        StrCpy $OptStartMenu ${BST_CHECKED}     ; first install → checked
    ${EndIf}

    ClearErrors
    ReadRegDWORD $OptContextMenu HKCU "Software\persephone\Install" "ContextMenu"
    ${If} ${Errors}
        StrCpy $OptContextMenu ${BST_CHECKED}   ; first install → checked
    ${EndIf}

    ClearErrors
    ReadRegDWORD $OptFolderMenu HKCU "Software\persephone\Install" "FolderMenu"
    ${If} ${Errors}
        StrCpy $OptFolderMenu ${BST_CHECKED}    ; first install → checked
    ${EndIf}

    ; Text-file associations are retired — never carried over from a previous
    ; install, so an upgrade always takes the release path in customInstall.
    StrCpy $OptTextFiles ${BST_UNCHECKED}

    ClearErrors
    ReadRegDWORD $OptBrowser HKCU "Software\persephone\Install" "Browser"
    ${If} ${Errors}
        StrCpy $OptBrowser ${BST_UNCHECKED}     ; first install → unchecked
    ${EndIf}
!macroend

; ========================================================================
; Custom page — "Additional Options" (after directory selection)
; ========================================================================

!macro customPageAfterChangeDir
    !ifndef BUILD_UNINSTALLER
        Page custom optionsPageCreate optionsPageLeave
    !endif
!macroend

; --- Page create (installer only) ----------------------------------------

!ifndef BUILD_UNINSTALLER
Function optionsPageCreate
    ; Set the page header text (via dialog item IDs — avoids MUI macro dependency).
    GetDlgItem $R8 $HWNDPARENT 1037
    SendMessage $R8 ${WM_SETTEXT} 0 "STR:Additional Options"
    GetDlgItem $R8 $HWNDPARENT 1038
    SendMessage $R8 ${WM_SETTEXT} 0 "STR:Select additional features to configure."

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
        Abort
    ${EndIf}

    ; --- Shortcuts section ---
    ${NSD_CreateLabel} 0 0u 100% 10u "Shortcuts:"
    Pop $0

    ${NSD_CreateCheckbox} 10u 13u 95% 12u "Create desktop shortcut"
    Pop $hChkDesktop
    ${If} $OptDesktop == ${BST_CHECKED}
        ${NSD_Check} $hChkDesktop
    ${EndIf}

    ${NSD_CreateCheckbox} 10u 27u 95% 12u "Create Start menu shortcut"
    Pop $hChkStartMenu
    ${If} $OptStartMenu == ${BST_CHECKED}
        ${NSD_Check} $hChkStartMenu
    ${EndIf}

    ; --- System integration section ---
    ${NSD_CreateLabel} 0 47u 100% 10u "System integration:"
    Pop $0

    ${NSD_CreateCheckbox} 10u 60u 95% 12u \
        'Add "Open with persephone" for files to Explorer context menu'
    Pop $hChkContextMenu
    ${If} $OptContextMenu == ${BST_CHECKED}
        ${NSD_Check} $hChkContextMenu
    ${EndIf}

    ${NSD_CreateCheckbox} 10u 74u 95% 12u \
        'Add "Open with persephone" for folders to Explorer context menu'
    Pop $hChkFolderMenu
    ${If} $OptFolderMenu == ${BST_CHECKED}
        ${NSD_Check} $hChkFolderMenu
    ${EndIf}

    ${NSD_CreateCheckbox} 10u 88u 95% 12u \
        "Register as default browser"
    Pop $hChkBrowser
    ${If} $OptBrowser == ${BST_CHECKED}
        ${NSD_Check} $hChkBrowser
    ${EndIf}

    nsDialogs::Show
FunctionEnd

; --- Page leave (capture checkbox states) --------------------------------

Function optionsPageLeave
    ${NSD_GetState} $hChkDesktop     $OptDesktop
    ${NSD_GetState} $hChkStartMenu   $OptStartMenu
    ${NSD_GetState} $hChkContextMenu $OptContextMenu
    ${NSD_GetState} $hChkFolderMenu  $OptFolderMenu
    ${NSD_GetState} $hChkBrowser     $OptBrowser
FunctionEnd
!endif ; !ifndef BUILD_UNINSTALLER

; ========================================================================
; customInstall — apply selected options after file installation
; ========================================================================

!macro customInstall
    ; ── Persist selections for uninstaller / future upgrades ──
    WriteRegDWORD HKCU "Software\persephone\Install" "Desktop"     $OptDesktop
    WriteRegDWORD HKCU "Software\persephone\Install" "StartMenu"   $OptStartMenu
    WriteRegDWORD HKCU "Software\persephone\Install" "ContextMenu" $OptContextMenu
    WriteRegDWORD HKCU "Software\persephone\Install" "FolderMenu"  $OptFolderMenu
    WriteRegDWORD HKCU "Software\persephone\Install" "TextFiles"   $OptTextFiles
    WriteRegDWORD HKCU "Software\persephone\Install" "Browser"     $OptBrowser

    ; ── 1. Desktop shortcut ──
    ${If} $OptDesktop == ${BST_CHECKED}
        CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\persephone-launcher.exe"
    ${Else}
        Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}

    ; ── 2. Start menu shortcut ──
    ${If} $OptStartMenu == ${BST_CHECKED}
        CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
        CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\persephone-launcher.exe"
    ${Else}
        Delete "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
        RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    ${EndIf}

    ; ── 3. Explorer "Open with" context menu for ALL files ──
    ${If} $OptContextMenu == ${BST_CHECKED}
        WriteRegStr HKCU "Software\Classes\*\shell\persephone" "" "Open with persephone"
        WriteRegStr HKCU "Software\Classes\*\shell\persephone" "Icon" "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Classes\*\shell\persephone\command" "" '"$INSTDIR\persephone-launcher.exe" "%1"'
    ${Else}
        DeleteRegKey HKCU "Software\Classes\*\shell\persephone"
    ${EndIf}

    ; ── 3b. Explorer "Open with" context menu for FOLDERS ──
    ;   `*` matches files only — folders need their own keys, and there are two:
    ;   `Directory` is right-click ON a folder (%1 = that folder), while
    ;   `Directory\Background` is right-click on empty space INSIDE a folder
    ;   (%V = the folder being viewed; %1 is empty there). Registering only the
    ;   first is the difference between the entry appearing where users expect
    ;   it and appearing half the time.
    ${If} $OptFolderMenu == ${BST_CHECKED}
        WriteRegStr HKCU "Software\Classes\Directory\shell\persephone" "" "Open with persephone"
        WriteRegStr HKCU "Software\Classes\Directory\shell\persephone" "Icon" "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Classes\Directory\shell\persephone\command" "" '"$INSTDIR\persephone-launcher.exe" "%1"'

        WriteRegStr HKCU "Software\Classes\Directory\Background\shell\persephone" "" "Open with persephone"
        WriteRegStr HKCU "Software\Classes\Directory\Background\shell\persephone" "Icon" "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Classes\Directory\Background\shell\persephone\command" "" '"$INSTDIR\persephone-launcher.exe" "%V"'
    ${Else}
        DeleteRegKey HKCU "Software\Classes\Directory\shell\persephone"
        DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\persephone"
    ${EndIf}

    ; ── 4. File associations for text/code files (RETIRED — release only) ──
    ;   The ProgID stays: the context-menu entries above do not need it, but
    ;   leaving it lets Windows' "Open with" list keep showing Persephone with
    ;   a proper name and icon instead of a bare exe path.
    WriteRegStr HKCU "Software\Classes\Persephone.Document" "" "Persephone Document"
    WriteRegStr HKCU "Software\Classes\Persephone.Document\DefaultIcon" "" "$INSTDIR\persephone-launcher.exe,0"
    WriteRegStr HKCU "Software\Classes\Persephone.Document\shell\open\command" "" '"$INSTDIR\persephone-launcher.exe" "%1"'

    ${If} $OptTextFiles == ${BST_CHECKED}
        !insertmacro _RegisterFileAssoc "txt"
        !insertmacro _RegisterFileAssoc "log"
        !insertmacro _RegisterFileAssoc "md"
        !insertmacro _RegisterFileAssoc "js"
        !insertmacro _RegisterFileAssoc "ts"
        !insertmacro _RegisterFileAssoc "jsx"
        !insertmacro _RegisterFileAssoc "tsx"
        !insertmacro _RegisterFileAssoc "json"
        !insertmacro _RegisterFileAssoc "xml"
        !insertmacro _RegisterFileAssoc "html"
        !insertmacro _RegisterFileAssoc "css"
        !insertmacro _RegisterFileAssoc "py"
        !insertmacro _RegisterFileAssoc "java"
        !insertmacro _RegisterFileAssoc "c"
        !insertmacro _RegisterFileAssoc "cpp"
    ${Else}
        ; Unchecked (or unchecked during upgrade) — clean up our associations.
        !insertmacro _UnRegisterFileAssoc "txt"
        !insertmacro _UnRegisterFileAssoc "log"
        !insertmacro _UnRegisterFileAssoc "md"
        !insertmacro _UnRegisterFileAssoc "js"
        !insertmacro _UnRegisterFileAssoc "ts"
        !insertmacro _UnRegisterFileAssoc "jsx"
        !insertmacro _UnRegisterFileAssoc "tsx"
        !insertmacro _UnRegisterFileAssoc "json"
        !insertmacro _UnRegisterFileAssoc "xml"
        !insertmacro _UnRegisterFileAssoc "html"
        !insertmacro _UnRegisterFileAssoc "css"
        !insertmacro _UnRegisterFileAssoc "py"
        !insertmacro _UnRegisterFileAssoc "java"
        !insertmacro _UnRegisterFileAssoc "c"
        !insertmacro _UnRegisterFileAssoc "cpp"
    ${EndIf}

    ; ── 5. Browser registration ──
    ${If} $OptBrowser == ${BST_CHECKED}
        ; --- Internet client registration ---
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone" "" "Persephone"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities" \
            "ApplicationName" "Persephone"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities" \
            "ApplicationDescription" "Persephone"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities\URLAssociations" \
            "http" "PersephoneURL"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities\URLAssociations" \
            "https" "PersephoneURL"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities\FileAssociations" \
            ".htm" "PersephoneHTM"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\Capabilities\FileAssociations" \
            ".html" "PersephoneHTM"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\DefaultIcon" "" \
            "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Clients\StartMenuInternet\persephone\shell\open\command" "" \
            '"$INSTDIR\persephone-launcher.exe"'

        ; --- URL protocol handler ---
        WriteRegStr HKCU "Software\Classes\PersephoneURL" "" "Persephone URL"
        WriteRegStr HKCU "Software\Classes\PersephoneURL" "URL Protocol" ""
        WriteRegStr HKCU "Software\Classes\PersephoneURL\DefaultIcon" "" \
            "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Classes\PersephoneURL\shell\open\command" "" \
            '"$INSTDIR\persephone-launcher.exe" "%1"'

        ; --- HTML file handler ---
        WriteRegStr HKCU "Software\Classes\PersephoneHTM" "" "Persephone HTML Document"
        WriteRegStr HKCU "Software\Classes\PersephoneHTM\DefaultIcon" "" \
            "$INSTDIR\persephone-launcher.exe,0"
        WriteRegStr HKCU "Software\Classes\PersephoneHTM\shell\open\command" "" \
            '"$INSTDIR\persephone-launcher.exe" "%1"'

        ; --- Registered application (makes it appear in Default Apps) ---
        WriteRegStr HKCU "Software\RegisteredApplications" "persephone" \
            "Software\Clients\StartMenuInternet\persephone\Capabilities"
    ${Else}
        DeleteRegKey HKCU "Software\Clients\StartMenuInternet\persephone"
        DeleteRegKey HKCU "Software\Classes\PersephoneURL"
        DeleteRegKey HKCU "Software\Classes\PersephoneHTM"
        DeleteRegValue HKCU "Software\RegisteredApplications" "persephone"
    ${EndIf}

    ; ── Notify the shell so Explorer picks up changes immediately ──
    System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; ========================================================================
; customUnInstall — remove only the options that were installed
; ========================================================================

!macro customUnInstall
    ; Read what was installed.
    ;
    ; ORDER MATTERS BELOW: _UnRegisterFileAssoc reuses $R0 and $R1 as scratch,
    ; so every ${If} that tests $R0/$R1 must run BEFORE the $R3 branch that
    ; invokes it. It does today, and $R5 is never touched by the macro — but
    ; moving a cleanup block past the TextFiles loop would silently turn this
    ; into a real clobber, with no error, just skipped cleanup.
    ReadRegDWORD $R0 HKCU "Software\persephone\Install" "Desktop"
    ReadRegDWORD $R1 HKCU "Software\persephone\Install" "StartMenu"
    ReadRegDWORD $R2 HKCU "Software\persephone\Install" "ContextMenu"
    ReadRegDWORD $R3 HKCU "Software\persephone\Install" "TextFiles"
    ReadRegDWORD $R4 HKCU "Software\persephone\Install" "Browser"
    ReadRegDWORD $R5 HKCU "Software\persephone\Install" "FolderMenu"

    ; ── 1. Desktop shortcut ──
    ${If} $R0 == ${BST_CHECKED}
        Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}

    ; ── 2. Start menu shortcut ──
    ${If} $R1 == ${BST_CHECKED}
        Delete "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
        RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    ${EndIf}

    ; ── 3. Context menu (files) ──
    ${If} $R2 == ${BST_CHECKED}
        DeleteRegKey HKCU "Software\Classes\*\shell\persephone"
    ${EndIf}

    ; ── 3b. Context menu (folders) ──
    ${If} $R5 == ${BST_CHECKED}
        DeleteRegKey HKCU "Software\Classes\Directory\shell\persephone"
        DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\persephone"
    ${EndIf}

    ; ── 4. File associations ──
    ;   Only reachable for installs predating the retirement of that option —
    ;   any upgrade since will already have released them.
    ${If} $R3 == ${BST_CHECKED}
        !insertmacro _UnRegisterFileAssoc "txt"
        !insertmacro _UnRegisterFileAssoc "log"
        !insertmacro _UnRegisterFileAssoc "md"
        !insertmacro _UnRegisterFileAssoc "js"
        !insertmacro _UnRegisterFileAssoc "ts"
        !insertmacro _UnRegisterFileAssoc "jsx"
        !insertmacro _UnRegisterFileAssoc "tsx"
        !insertmacro _UnRegisterFileAssoc "json"
        !insertmacro _UnRegisterFileAssoc "xml"
        !insertmacro _UnRegisterFileAssoc "html"
        !insertmacro _UnRegisterFileAssoc "css"
        !insertmacro _UnRegisterFileAssoc "py"
        !insertmacro _UnRegisterFileAssoc "java"
        !insertmacro _UnRegisterFileAssoc "c"
        !insertmacro _UnRegisterFileAssoc "cpp"
    ${EndIf}

    ; Always remove the ProgID
    DeleteRegKey HKCU "Software\Classes\Persephone.Document"

    ; ── 5. Browser registration ──
    ${If} $R4 == ${BST_CHECKED}
        DeleteRegKey HKCU "Software\Clients\StartMenuInternet\persephone"
        DeleteRegKey HKCU "Software\Classes\PersephoneURL"
        DeleteRegKey HKCU "Software\Classes\PersephoneHTM"
        DeleteRegValue HKCU "Software\RegisteredApplications" "persephone"
    ${EndIf}

    ; ── Clean up our own registry branch ──
    DeleteRegKey HKCU "Software\persephone\Install"

    ; Notify the shell
    System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
