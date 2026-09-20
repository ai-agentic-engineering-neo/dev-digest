@echo off
REM Quick-run wrapper for scripts\run.ps1 — see that file for details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
