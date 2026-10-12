@echo off
rem One-time setup for the DealDesk daily listing check on this laptop. Double-click it.
rem Makes a private copy of the repo, schedules the check for 6:05am every day (waking the laptop if it is asleep),
rem and runs it once now so Git can ask you to sign in to GitHub.
setlocal
where git >nul 2>&1 || (echo Git is not installed. Install it from https://git-scm.com/download/win and run this again. & pause & exit /b 1)
where node >nul 2>&1 || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
set "HOME_DIR=%LOCALAPPDATA%\DealDeskDaily"
if not exist "%HOME_DIR%\.git" (
  echo Making a private copy of DealDesk in %HOME_DIR% ...
  git clone -q https://github.com/CartLabs/DealDesk.git "%HOME_DIR%" || (echo Clone failed. & pause & exit /b 1)
)
cd /d "%HOME_DIR%"
git pull -q origin main
echo Scheduling the check for 6:05am every day ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$a=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c ' + $env:LOCALAPPDATA + '\DealDeskDaily\tools\daily-check-windows.cmd');" ^
  "$t=New-ScheduledTaskTrigger -Daily -At 6:05am;" ^
  "$s=New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30);" ^
  "Register-ScheduledTask -TaskName 'DealDesk daily listing check' -Action $a -Trigger $t -Settings $s -Force | Out-Null" || (echo Could not create the scheduled task. & pause & exit /b 1)
echo Running the check once now. If a GitHub sign-in window opens, sign in with the account that can push to CartLabs/DealDesk.
call tools\daily-check-windows.cmd
echo.
echo Last lines of the log:
powershell -NoProfile -Command "Get-Content '%HOME_DIR%\daily-check.log' -Tail 25"
echo.
echo Done. The check now runs every day at 6:05am. Your 6:49am alert reports how it went.
pause
