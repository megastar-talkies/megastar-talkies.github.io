@echo off
rem Serves the site locally - YouTube's player will not run from a file:// page.
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000
