# PowerWorld Simulation Analyzer

A web application for analyzing PowerWorld simulation CSV files with interactive visualizations.

## Features

- CSV file upload (drag & drop or file picker)
- Interactive time series charts showing branch loading over time
- Current loading bar chart
- Loading distribution histogram
- Statistics dashboard
- Branch selection for filtering data
- Visual indicators for 100% limit threshold

## Quick Start

### Using Docker (Recommended)

```bash
./start.sh
```

Or manually:
```bash
docker-compose up --build
```

Then open `http://localhost:3000` in your browser (frontend) and `http://localhost:8000` for the API.

### Using Docker Run

**Backend:**
```bash
docker build -f Dockerfile.backend -t powerworld-backend .
docker run -p 8000:8000 powerworld-backend
```

**Frontend:**
```bash
docker build -f Dockerfile.frontend -t powerworld-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 powerworld-frontend
```

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python main.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser.

## Tech Stack

- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS, Plotly.js
- **Backend**: FastAPI (Python)
- **Charts**: Plotly.js for interactive visualizations
- **Deployment**: Vercel (frontend), Railway/Render (backend)

## Usage

1. Start the services (via Docker or locally)
2. Open `http://localhost:3000` in your browser
3. Upload a CSV file with PowerWorld simulation data
4. View interactive graphs and statistics

## CSV Format

The application expects CSV files with:
- First column: DateTimeUTCExcelFormat (Excel date format)
- Subsequent columns: Branch data with "% of MVA Limit From" in column names

Example:
```
DateTimeUTCExcelFormat, Branch '1' '2' '1' % of MVA Limit From, ...
45944.9166667, 80.74528, 42.62214, ...
```

## Deployment

### Vercel (Frontend - Recommended)

The Next.js frontend is optimized for Vercel deployment:

1. Push your code to GitHub
2. Import the project in Vercel
3. Set root directory to `frontend`
4. Add environment variable: `NEXT_PUBLIC_API_URL` pointing to your backend URL
5. Deploy!

The `vercel.json` is already configured for Next.js.

### Backend Hosting

For the FastAPI backend, deploy separately to:
- **Railway** - Easy Python deployment, free tier
- **Render** - Free tier available, good for FastAPI
- **Fly.io** - Good for Docker deployments
- **Heroku** - Traditional option (paid)

After deploying the backend, update `NEXT_PUBLIC_API_URL` in Vercel to point to your backend URL.

## Future Enhancements

- Limitations configuration (set custom limits per branch)
- Budgeting constraints
- Export functionality
- Multiple file comparison
- Alert system for over-limit conditions

