@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Norma Workbench - Local
if not exist "app\index.html" goto missing
where node >nul 2>&1
if not errorlevel 1 goto use_node
where py >nul 2>&1
if errorlevel 1 goto use_powershell
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
if not errorlevel 1 goto use_python
goto use_powershell
:use_node
node "%~dp0start-local.cjs"
goto finished
:use_python
py -3 "%~dp0start-local.py"
goto finished
:use_powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
goto finished
:missing
echo Полностью распакуйте архив. Папка app должна лежать рядом с этим файлом.
pause
exit /b 1
:finished
if errorlevel 1 (
  echo.
  echo Не удалось запустить приложение. Ошибка показана выше.
  pause
)
endlocal
