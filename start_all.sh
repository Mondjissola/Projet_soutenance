#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ========================================
echo    AgriSmart - Lancement du projet
echo ========================================
echo

PYTHON_BIN=python3
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN=python
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[ERREUR] Python n'est pas installe ou n'est pas dans le PATH."
  echo "Installez Python 3.x puis relancez ce script."
  exit 1
fi

if [ -f requirements.txt ]; then
  echo "[INFO] Installation/verification des dependances depuis requirements.txt..."
  "$PYTHON_BIN" -m pip install -r requirements.txt
else
  echo "[AVERTISSEMENT] requirements.txt introuvable. Installation minimale..."
  "$PYTHON_BIN" -m pip install Flask Flask-CORS requests Django
fi

export DATA_UPDATE_INTERVAL=3

echo "[INFO] Demarrage du serveur de donnees (http://localhost:5000)..."
if command -v x-terminal-emulator >/dev/null 2>&1; then
  x-terminal-emulator -e "$PYTHON_BIN data_server.py" &
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- $PYTHON_BIN data_server.py &
elif command -v konsole >/dev/null 2>&1; then
  konsole -e $PYTHON_BIN data_server.py &
else
  nohup "$PYTHON_BIN" data_server.py > data_server.log 2>&1 &
fi

echo "[INFO] Demarrage de l'emission de mesures..."
if command -v x-terminal-emulator >/dev/null 2>&1; then
  x-terminal-emulator -e "$PYTHON_BIN esp32_sender.py" &
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- $PYTHON_BIN esp32_sender.py &
elif command -v konsole >/dev/null 2>&1; then
  konsole -e $PYTHON_BIN esp32_sender.py &
else
  nohup "$PYTHON_BIN" esp32_sender.py > esp32_sender.log 2>&1 &
fi

echo
echo "[INFO] Demarrage du serveur Django (http://localhost:8000)..."
echo "Pour arreter le serveur Django, appuyez sur Ctrl+C"
exec "$PYTHON_BIN" manage.py runserver 0.0.0.0:8000
