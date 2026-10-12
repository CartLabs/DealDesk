@echo off
rem DealDesk daily listing check. Windows Task Scheduler runs this every morning (see install-daily-task.cmd).
rem It works in its own copy of the repo, so it never touches the folder you use in GitHub Desktop.
cd /d "%~dp0.."
echo ===== %DATE% %TIME% >> daily-check.log
git fetch -q origin main >> daily-check.log 2>&1
git checkout -q -B main origin/main >> daily-check.log 2>&1
git reset -q --hard origin/main >> daily-check.log 2>&1
node tools\daily-check.js --commit >> daily-check.log 2>&1
