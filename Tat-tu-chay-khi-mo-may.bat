@echo off
chcp 65001 >nul
title Christmas MV Studio - tat tu chay khi mo may
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = [Environment]::GetFolderPath('Startup') + '\Christmas MV Studio.lnk'; if (Test-Path $p) { Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin'); 'Da tat tu chay (loi tat da vao Thung rac).' } else { 'Chua bat tu chay.' }"
pause
