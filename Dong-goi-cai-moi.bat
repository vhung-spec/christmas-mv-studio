@echo off
chcp 65001 >nul
title Dong goi Christmas MV Studio - ban cai moi
cd /d "%~dp0"
node scripts\dong-goi.mjs %*
pause
