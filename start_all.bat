@echo off
setlocal

rem ========================================
rem   AgriSmart - Lancement du projet
rem ========================================
echo ========================================
echo    AgriSmart - Lancement du projet
echo ========================================
echo.

rem Se placer dans le dossier du script
cd /d "%~dp0"

rem Vérifier la présence de Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERREUR] Python n'est pas installe ou n'est pas dans le PATH.
  echo Installez Python 3.x puis relancez ce script.
  pause
  exit /b 1
)

rem Installer les dependances (si non installées)
if exist requirements.txt (
  echo [INFO] Installation/verification des dependances depuis requirements.txt...
  python -m pip install -r requirements.txt
) else (
  echo [AVERTISSEMENT] requirements.txt introuvable. Installation minimale...
  python -m pip install Flask Flask-CORS requests Django
)

rem Configurer la simulation: mise a jour chaque minute
set DATA_UPDATE_INTERVAL=3

rem Demarrer le serveur de donnees dans une nouvelle fenetre (port 5000)
echo [INFO] Demarrage du serveur de donnees (http://localhost:5000)...
start "AgriSmart - Data Server" cmd /c python data_server.py

rem Demarrer l'emetteur de mesures dans une nouvelle fenetre
echo [INFO] Demarrage de l'emission de mesures...
start "AgriSmart - Data Input" cmd /c python esp32_sender.py

rem Demarrer le serveur Django dans cette fenetre (port 8000 par defaut)
echo.
echo [INFO] Demarrage du serveur Django (http://localhost:8000)...
echo Pour arreter le serveur Django, appuyez sur Ctrl+C
python manage.py runserver

endlocal
