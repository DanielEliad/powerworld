#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[dev]${NC} $1"; }
success() { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
error() { echo -e "${RED}[dev]${NC} $1"; }

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cleanup function
cleanup() {
    log "Shutting down..."
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Kill any remaining child processes
    pkill -P $$ 2>/dev/null || true
    success "Stopped all services"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Check if we're in a nix-shell or need to set up Python ourselves
setup_python() {
    if [ -z "$IN_NIX_SHELL" ]; then
        # Not in nix-shell, set up venv manually
        if [ ! -d "venv" ]; then
            log "Creating Python virtual environment..."
            python3 -m venv venv
        fi
        source venv/bin/activate

        # Install/update requirements if needed
        if [ ! -f "venv/.requirements_installed" ] || [ "backend/requirements.txt" -nt "venv/.requirements_installed" ]; then
            log "Installing Python dependencies..."
            pip install --upgrade pip -q
            pip install -r backend/requirements.txt -q
            touch venv/.requirements_installed
            success "Python dependencies installed"
        fi
    else
        # In nix-shell, venv should already be activated
        if [ ! -f "venv/.requirements_installed" ] || [ "backend/requirements.txt" -nt "venv/.requirements_installed" ]; then
            log "Installing Python dependencies..."
            pip install -r backend/requirements.txt -q
            touch venv/.requirements_installed
        fi
    fi
}

setup_frontend() {
    cd "$SCRIPT_DIR/frontend"
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
        log "Installing frontend dependencies..."
        npm install --silent
        success "Frontend dependencies installed"
    fi
    cd "$SCRIPT_DIR"
}

start_backend() {
    log "Starting backend on http://localhost:8000 ..."
    cd "$SCRIPT_DIR/backend"
    uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    cd "$SCRIPT_DIR"
}

start_frontend() {
    log "Starting frontend on http://localhost:3000 ..."
    cd "$SCRIPT_DIR/frontend"
    # Don't set NEXT_PUBLIC_API_URL - let Next.js proxy handle it via rewrites
    npm run dev &
    FRONTEND_PID=$!
    cd "$SCRIPT_DIR"
}

wait_for_backend() {
    log "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then
            success "Backend is ready!"
            return 0
        fi
        sleep 1
    done
    error "Backend failed to start after 30 seconds"
    return 1
}

main() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     PowerWorld Dev Server             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""

    setup_python
    setup_frontend

    start_backend
    wait_for_backend
    start_frontend

    echo ""
    success "Development servers running:"
    echo -e "  ${BLUE}Frontend:${NC} http://localhost:3000"
    echo -e "  ${BLUE}Backend:${NC}  http://localhost:8000"
    echo -e "  ${BLUE}API Docs:${NC} http://localhost:8000/docs"
    echo ""
    log "Press Ctrl+C to stop"
    echo ""

    # Wait for both processes
    wait
}

main
