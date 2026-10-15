#!/usr/bin/env bash
# =============================================================================
# CardioSight: One-Click Startup Script (Optional Helper)
# Starts PostgreSQL check, Django ML Microservice, Express Gateway, and Angular.
# Press Control + C anytime to stop all services cleanly.
# =============================================================================

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
echo "================================================================="
echo "Starting CardioSight Cardiovascular Platform..."
echo "Directory: $DIR"
echo "================================================================="

# 1. Check PostgreSQL
echo "[1/4] Checking PostgreSQL database..."
if ! nc -z localhost 5432 2>/dev/null; then
  echo "      PostgreSQL is not responding on port 5432."
  echo "      Attempting to start PostgreSQL service..."
  if command -v brew >/dev/null 2>&1; then
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
  fi
fi

# 2. Check Backend .env
if [ ! -f "$DIR/Backend/.env" ]; then
  echo "      Creating Backend/.env from .env.example..."
  cp "$DIR/Backend/.env.example" "$DIR/Backend/.env"
fi

# 3. Resolve Python Virtual Environment
VENV_PATH="$DIR/ML/.venv"
if [ ! -d "$VENV_PATH" ]; then
  if [ -d "$DIR/ML/.venv_fixed" ]; then
    VENV_PATH="$DIR/ML/.venv_fixed"
  else
    echo "      Creating fresh Python virtual environment in ML/.venv..."
    python3 -m venv "$DIR/ML/.venv"
    "$DIR/ML/.venv/bin/pip" install --upgrade pip
    "$DIR/ML/.venv/bin/pip" install -r "$DIR/ML/requirements.txt"
    VENV_PATH="$DIR/ML/.venv"
  fi
fi

# Trap signals to clean up background processes on exit
cleanup() {
  echo ""
  echo "================================================================="
  echo "Shutting down CardioSight services..."
  echo "================================================================="
  if [ -n "$DJANGO_PID" ]; then kill "$DJANGO_PID" 2>/dev/null || true; fi
  if [ -n "$EXPRESS_PID" ]; then kill "$EXPRESS_PID" 2>/dev/null || true; fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 4. Start Django ML Service
echo "[2/4] Starting Django ML Service on http://127.0.0.1:8000..."
cd "$DIR/ML"
"$VENV_PATH/bin/python" manage.py runserver 127.0.0.1:8000 > /dev/null 2>&1 &
DJANGO_PID=$!
sleep 2

# 5. Start Express Backend Gateway
echo "[3/4] Starting Express Backend Gateway on http://localhost:3000..."
cd "$DIR/Backend"
node server.js > /dev/null 2>&1 &
EXPRESS_PID=$!
sleep 2

# 6. Start Angular Frontend
echo "[4/4] Starting Angular Web Application on http://localhost:4200..."
echo ""
echo "================================================================="
echo "CardioSight is LIVE!"
echo "Open your web browser at: http://localhost:4200"
echo "Default Administrator:    admin@cardiosight.local / Admin@12345"
echo ""
echo "Press CONTROL + C in this window to stop all services."
echo "================================================================="
echo ""

cd "$DIR/Frontend"
npm start
