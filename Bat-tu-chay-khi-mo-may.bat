@echo off
chcp 65001 >nul
title Christmas MV Studio - bat tu chay khi mo may
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\Christmas MV Studio.lnk'); $s.TargetPath = '%~dp0Chay-Christmas-MV-Studio.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
if errorlevel 1 (
  echo.
  echo Khong tao duoc loi tat trong thu muc Startup.
  pause
  exit /b 1
)
echo.
echo Da bat: moi lan dang nhap Windows, Christmas MV Studio tu chay (cua so thu nho)
echo va tu lam tiep cac viec dang do (kich ban, clip Muse, dung MP4, dong bo kho nhac).
echo Muon tat: chay file Tat-tu-chay-khi-mo-may.bat
pause
