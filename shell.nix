{ pkgs ? import <nixpkgs> {} }:

let
  pythonLibs = with pkgs; [
    stdenv.cc.cc.lib
    zlib
    glib
    libGL
  ];
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    python311
    python311Packages.pip
    python311Packages.virtualenv
    nodejs_22
    gcc
    curl  # for health checks in dev.sh
  ];

  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath pythonLibs;

  shellHook = ''
    # Python venv setup
    if [ ! -d "venv" ]; then
      echo "Creating virtual environment..."
      python -m venv venv
    fi

    source venv/bin/activate

    if [ ! -f "venv/.requirements_installed" ] || [ "backend/requirements.txt" -nt "venv/.requirements_installed" ]; then
      echo "Installing Python requirements..."
      pip install --upgrade pip -q
      pip install -r backend/requirements.txt -q
      touch venv/.requirements_installed
    fi

    # Node modules setup
    if [ ! -d "frontend/node_modules" ] || [ "frontend/package.json" -nt "frontend/node_modules/.package-lock.json" ]; then
      echo "Installing frontend dependencies..."
      (cd frontend && npm install --silent)
    fi

    echo ""
    echo "Development environment ready!"
    echo "  Run ./dev.sh to start both servers"
    echo ""
  '';
}
