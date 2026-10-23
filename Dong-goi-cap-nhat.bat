@echo off
chcp 65001 >nul
title Dong goi Christmas MV Studio - ban cap nhat
cd /d "%~dp0"
node scripts\dong-goi.mjs --cap-nhat %*
pause
