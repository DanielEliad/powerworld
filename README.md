# PowerWorld Simulation Analyzer

Web application for analyzing PowerWorld simulation data with interactive visualizations.

## Quick Start

### Local Development

```bash
# With Nix (recommended)
nix-shell
./dev.sh

# Without Nix (requires python3 & node)
./dev.sh
```

Opens:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

Both servers hot-reload on file changes.

### Docker (Local)

```bash
docker build -f Dockerfile.combined -t powerworld .
docker run -p 3000:3000 powerworld
```

## Deploy to Render

1. Create a new **Web Service** on Render
2. Connect your GitHub repo
3. Configure:
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile.combined`
   - **Port**: `3000`

No environment variables needed - the app works out of the box.

## Project Structure

```
├── frontend/             # Next.js app
│   └── app/
│       ├── components/   # React components
│       ├── hooks/        # Custom hooks
│       └── lib/          # Utilities
├── backend/              # FastAPI server
├── dev.sh                # Development script
├── shell.nix             # Nix environment
└── Dockerfile.combined   # Production build
```

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Plotly.js
- **Backend**: FastAPI, pandas, reportlab
