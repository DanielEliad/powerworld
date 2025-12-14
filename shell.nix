{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    python311
    python311Packages.pip
    python311Packages.virtualenv
  ];

  shellHook = ''
    echo "Setting up Python environment..."
    
    # Create venv if it doesn't exist
    if [ ! -d "venv" ]; then
      echo "Creating virtual environment..."
      ${pkgs.python311}/bin/python3 -m venv venv
    fi
    
    # Activate venv
    source venv/bin/activate
    
    # Install requirements if not already installed or if requirements.txt is newer
    if [ ! -f "venv/.requirements_installed" ] || [ "backend/requirements.txt" -nt "venv/.requirements_installed" ]; then
      echo "Installing requirements..."
      pip install --upgrade pip
      pip install -r backend/requirements.txt
      touch venv/.requirements_installed
    fi
    
    echo "Python environment ready!"
    echo "Virtual environment is activated. Run 'deactivate' to exit."
  '';
}

