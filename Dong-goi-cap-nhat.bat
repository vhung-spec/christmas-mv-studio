@echo off
chcp 65001 >nul
title Dong goi MV Prompt Studio - ban cap nhat
cd /d "%~dp0"
node scripts\dong-goi.mjs --cap-nhat %*
pause
