set -e

echo "Starting PowerWorld Simulation Analyzer..."

if command -v docker-compose &> /dev/null; then
    echo "Using docker-compose..."
    echo "Note: Watch mode requires Docker Compose v2.4+"
    docker-compose up --build
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo "Using docker compose with watch mode..."
    docker compose watch
else
    echo "Docker not found. Starting services locally..."
    
    echo "Starting backend..."
    cd backend
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    python main.py &
    BACKEND_PID=$!
    cd ..
    
    echo "Starting frontend..."
    cd frontend
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    
    echo ""
    echo "Backend running on http://localhost:8000"
    echo "Frontend running on http://localhost:3000"
    echo ""
    echo "Press Ctrl+C to stop all services"
    
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
    wait
fi

