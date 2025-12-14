from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
from datetime import datetime, timedelta
import os
import io
import re

app = FastAPI(title="PowerWorld Simulation Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/")
async def read_root():
    return {"message": "PowerWorld Simulation Analyzer API", "status": "running"}

@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {"filename": file.filename, "message": "File uploaded successfully"}

class PasteDataRequest(BaseModel):
    data: str

class UpdateBatteryRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    datetime: List[str]

def parse_generators_to_dataframe(text: str) -> pd.DataFrame:
    """Parse raw generator data and return a pandas DataFrame."""
    # Split lines and keep all lines (including empty ones) to preserve structure
    all_lines = text.split('\n')
    
    # Find the header row (contains both Date and Time, tab-separated)
    header_index = -1
    for i, line in enumerate(all_lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        # Check if this line contains both Date and Time (case insensitive)
        line_lower = line_stripped.lower()
        if 'date' in line_lower and 'time' in line_lower and '\t' in line_stripped:
            header_index = i
            break
    
    if header_index == -1:
        raise ValueError('Could not find header row with Date and Time columns')
    
    # Read from header row onwards, using tab separator
    data_lines = '\n'.join(all_lines[header_index:])
    df = pd.read_csv(io.StringIO(data_lines), sep='\t', dtype=str)
    
    # Remove Timepoint column if it exists
    if 'Timepoint' in df.columns:
        df = df.drop(columns=['Timepoint'])
    
    # Filter out header rows and empty rows
    df = df[df['Date'].notna() & df['Time'].notna()]
    df = df[~df['Date'].str.lower().isin(['date', 'timepoint'])]
    df = df[df['Date'].str.strip() != '']
    
    # Convert numeric columns
    for col in df.columns:
        if col not in ['Date', 'Time']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
    
    return df.reset_index(drop=True)

def parse_datetime(date_str: str, time_str: str) -> str:
    date_parts = date_str.split('/')
    if len(date_parts) != 3:
        raise ValueError(f"Invalid date format: {date_str}")
    
    month, day, year = date_parts
    
    time_parts = time_str.split(' ')
    time_part = time_parts[0] if time_parts else ''
    ampm = time_parts[1].upper() if len(time_parts) > 1 else ''
    
    time_components = time_part.split(':')
    hours = int(time_components[0]) if time_components else 0
    minutes = int(time_components[1]) if len(time_components) > 1 else 0
    seconds = int(time_components[2]) if len(time_components) > 2 else 0
    
    if ampm == 'PM' and hours != 12:
        hours += 12
    elif ampm == 'AM' and hours == 12:
        hours = 0
    
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}T{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{str(seconds).zfill(2)}"

def parse_lines_to_dataframe(text: str) -> pd.DataFrame:
    """Parse raw lines data and return a pandas DataFrame."""
    lines = [line.strip() for line in text.strip().split('\n') if line.strip()]
    if not lines:
        raise ValueError('No data found')
    
    # Skip "Timepoint" header row if present
    start_index = 0
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if 'timepoint' in line_lower and ('date' not in line_lower or 'time' not in line_lower):
            start_index = i + 1
            break
    
    # Find the actual header row (contains Date and Time)
    header_index = start_index
    for i in range(start_index, len(lines)):
        line_lower = lines[i].lower()
        if 'date' in line_lower and 'time' in line_lower:
            header_index = i
            break
    
    # Read into DataFrame, skipping Timepoint row
    data_lines = '\n'.join(lines[header_index:])
    df = pd.read_csv(io.StringIO(data_lines), sep='\t', dtype=str)
    
    # Remove Timepoint column if it exists
    if 'Timepoint' in df.columns:
        df = df.drop(columns=['Timepoint'])
    
    # Filter out header rows (where Date is "Date" or "Timepoint")
    df = df[~df['Date'].str.lower().isin(['date', 'timepoint'])]
    df = df[df['Date'].notna() & df['Time'].notna()]
    
    # Convert numeric columns (except Date and Time)
    for col in df.columns:
        if col not in ['Date', 'Time', 'Skip']:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
    
    return df.reset_index(drop=True)

@app.post("/api/analyze/lines")
async def analyze_lines(request: PasteDataRequest):
    try:
        df = parse_lines_to_dataframe(request.data)
        
        if 'Date' not in df.columns or 'Time' not in df.columns:
            raise HTTPException(status_code=400, detail="Date and Time columns are required")
        
        # Find branch columns
        branch_columns = [col for col in df.columns if '% of mva limit from' in col.lower() or 'mva limit' in col.lower()]
        
        if not branch_columns:
            raise HTTPException(status_code=400, detail="No branch columns found in data")
        
        # Parse datetimes
        datetimes = []
        for _, row in df.iterrows():
            try:
                dt = parse_datetime(str(row['Date']), str(row['Time']))
                datetimes.append(dt)
            except ValueError:
                datetimes.append('')
        
        # Extract branch data
        branches = {}
        for col in branch_columns:
            match = re.search(r'(\d+)\s+\([^)]+\)\s+TO\s+(\d+)\s+\([^)]+\)', col)
            branch_name = f"{match.group(1)}-{match.group(2)}" if match else col
            branches[branch_name] = df[col].tolist()
        
        # Calculate statistics
        stats = {}
        for branch_name, values in branches.items():
            numeric_values = [float(v) for v in values if pd.notna(v)]
            if numeric_values:
                stats[branch_name] = {
                    "max": max(numeric_values),
                    "min": min(numeric_values),
                    "avg": sum(numeric_values) / len(numeric_values),
                    "current": numeric_values[-1] if numeric_values else None
                }
        
        return {
            "data": {
                "datetime": datetimes,
                "branches": branches
            },
            "statistics": stats,
            "branch_names": list(branches.keys())
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error processing lines data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing lines data: {str(e)}")

@app.post("/api/analyze/generators")
async def analyze_generators(request: PasteDataRequest):
    try:
        df = parse_generators_to_dataframe(request.data)
        
        if 'Date' not in df.columns or 'Time' not in df.columns:
            raise HTTPException(status_code=400, detail="Date and Time columns are required")
        
        # Parse datetimes
        datetimes = []
        for _, row in df.iterrows():
            try:
                dt = parse_datetime(str(row['Date']), str(row['Time']))
                datetimes.append(dt)
            except ValueError:
                datetimes.append('')
        
        # Add extra 00:00 entry for next day (to consume last generation entry)
        if datetimes and datetimes[-1]:
            try:
                last_dt = datetime.fromisoformat(datetimes[-1])
                next_day = last_dt.replace(hour=0, minute=0, second=0)
                if next_day <= last_dt:
                    # If 00:00 is not after last timestep, add a day
                    next_day = next_day + timedelta(days=1)
                datetimes.append(next_day.isoformat())
            except:
                datetimes.append('')
        
        # Identify generator columns (exclude "gen 1 #1" which has constant high values)
        gen_columns = [col for col in df.columns if col.lower().startswith('gen') and 'mw' in col.lower() and 'gen 1 #1' not in col.lower()]
        
        # Identify battery generators and group by bus
        battery_columns = [col for col in gen_columns if '#bt' in col.lower()]
        battery_by_bus = {}
        for col in battery_columns:
            match = re.search(r'gen\s*(\d+)', col, re.IGNORECASE)
            if match:
                bus_num = int(match.group(1))
                if bus_num not in battery_by_bus:
                    battery_by_bus[bus_num] = []
                battery_by_bus[bus_num].append(col)
        
        # Calculate battery capacity using pandas (convert to kWh: 1 MWh = 1000 kWh)
        # Capacity starts at 0, then each timestep = previous - generation_at_previous_timestep
        # Add one extra entry at 00:00 to consume the last generation entry
        battery_capacity = {}
        for bus_num, gen_names in battery_by_bus.items():
            bus_mw = df[gen_names].sum(axis=1)
            # capacity[0] = 0, capacity[i] = capacity[i-1] - bus_mw[i-1]
            # Add one more: capacity[n] = capacity[n-1] - bus_mw[n-1]
            capacity_values = [0.0]
            for i in range(len(bus_mw)):
                capacity_values.append(capacity_values[-1] - bus_mw.iloc[i])
            capacity_mwh = pd.Series(capacity_values)  # n+1 values
            capacity_kwh = capacity_mwh * 1000  # Convert MWh to kWh
            battery_capacity[str(bus_num)] = capacity_kwh.tolist()
        
        # Build battery table (Date, Time, and battery columns only)
        battery_table_cols = ['Date', 'Time'] + battery_columns
        battery_table_df = df[battery_table_cols].copy()
        
        # Build metadata
        battery_table_metadata = {}
        for bus_num, gen_names in battery_by_bus.items():
            for gen_name in gen_names:
                battery_table_metadata[gen_name] = str(bus_num)
        
        # Convert to dict format
        generators_dict = {col: df[col].tolist() for col in gen_columns}
        all_data = df.to_dict('records')
        
        return {
            "columns": df.columns.tolist(),
            "rows": df.values.tolist(),
            "data": all_data,
            "datetime": datetimes,
            "generators": generators_dict,
            "generator_columns": gen_columns,
            "battery_capacity": battery_capacity,
            "battery_by_bus": {str(k): v for k, v in battery_by_bus.items()},
            "battery_table": {
                "columns": battery_table_cols,
                "data": battery_table_df.to_dict('records'),
                "metadata": battery_table_metadata
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error processing generators data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing generators data: {str(e)}")

class ReconstructTableRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    original_columns: List[str]
    original_data: List[Dict[str, Any]]

@app.post("/api/analyze/generators/reconstruct")
async def reconstruct_full_table(request: ReconstructTableRequest):
    """Reconstruct the full table with updated battery values in original format."""
    try:
        # Convert original data to DataFrame
        original_df = pd.DataFrame(request.original_data)
        
        # Convert battery table to DataFrame
        battery_df = pd.DataFrame(request.battery_table_data)
        
        # Merge on Date and Time to update battery columns
        battery_cols = [col for col in battery_df.columns if col not in ['Date', 'Time']]
        
        # Merge the battery data back into original dataframe
        for col in battery_cols:
            if col in original_df.columns:
                # Create a mapping from Date+Time to battery value
                battery_map = battery_df.set_index(['Date', 'Time'])[col].to_dict()
                # Update original dataframe using the mapping
                original_df[col] = original_df.apply(
                    lambda row: battery_map.get((str(row['Date']), str(row['Time'])), row[col]),
                    axis=1
                )
        
        # Convert back to tab-separated format (matching original input format)
        output_lines = []
        # Add "Timepoint" row at the start
        output_lines.append('Timepoint')
        # Add header row
        output_lines.append('\t'.join(original_df.columns.tolist()))
        # Add data rows
        for _, row in original_df.iterrows():
            output_lines.append('\t'.join([str(val) if pd.notna(val) else '' for val in row.values]))
        
        return {"data": '\n'.join(output_lines)}
    except Exception as e:
        logging.error(f"Error reconstructing table: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reconstructing table: {str(e)}")

@app.post("/api/analyze/generators/update-battery")
async def update_battery_capacity(request: UpdateBatteryRequest):
    try:
        if not request.battery_table_data:
            raise HTTPException(status_code=400, detail="No battery table data provided")
        
        # Convert to DataFrame
        df = pd.DataFrame(request.battery_table_data)
        
        # Get battery columns (excluding Date and Time)
        battery_cols = [col for col in df.columns if col not in ['Date', 'Time']]
        
        # Group by bus
        battery_by_bus = {}
        for col in battery_cols:
            match = re.search(r'gen\s*(\d+)', col, re.IGNORECASE)
            if match:
                bus_num = int(match.group(1))
                if bus_num not in battery_by_bus:
                    battery_by_bus[bus_num] = []
                battery_by_bus[bus_num].append(col)
        
        # Calculate capacity for each bus (convert to kWh: 1 MWh = 1000 kWh)
        # Capacity starts at 0, then each timestep = previous - generation_at_previous_timestep
        # Add one extra entry at 00:00 to consume the last generation entry
        battery_capacity = {}
        for bus_num, gen_names in battery_by_bus.items():
            bus_mw = df[gen_names].sum(axis=1)
            # capacity[0] = 0, capacity[i] = capacity[i-1] - bus_mw[i-1]
            # Add one more: capacity[n] = capacity[n-1] - bus_mw[n-1]
            capacity_values = [0.0]
            for i in range(len(bus_mw)):
                capacity_values.append(capacity_values[-1] - bus_mw.iloc[i])
            capacity_mwh = pd.Series(capacity_values)  # n+1 values
            capacity_kwh = capacity_mwh * 1000  # Convert MWh to kWh
            battery_capacity[str(bus_num)] = capacity_kwh.tolist()
        
        return {"battery_capacity": battery_capacity}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating battery capacity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating battery capacity: {str(e)}")

@app.get("/api/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    import logging
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info",
        access_log=True
    )

