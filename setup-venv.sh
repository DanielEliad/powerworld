#!/usr/bin/env bash

# Setup script to create venv and install requirements
# This can be run manually if not using nix-shell

set -e

echo "Setting up Python virtual environment..."

# Use Python from nix if available, otherwise use system Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "Error: Python not found. Please install Python 3.11 or later."
    exit 1
fi

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "Installing requirements from backend/requirements.txt..."
pip install -r backend/requirements.txt

echo "Setup complete!"
echo "To activate the virtual environment, run: source venv/bin/activate"

