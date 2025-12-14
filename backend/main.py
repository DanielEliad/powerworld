from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from enum import Enum
import pandas as pd
from datetime import datetime, timedelta
import os
import io
import re
import logging
import math

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

logging.basicConfig(level=logging.INFO)

# Enums
class BusType(str, Enum):
    PCC = "PCC"
    COMMUNITY = "Community"
    RESIDENTIAL = "Residential"

class BatteryType(str, Enum):
    HOME = "Home Battery"
    NEIGHBORHOOD = "Neighborhood Battery"

class ValidationErrorType(str, Enum):
    NEGATIVE_CAPACITY = "negative_capacity"
    ABOVE_MAX_SIZE = "above_max_size"
    EXCEEDS_POWER_RATING = "exceeds_power_rating"
    BATTERY_NOT_FULLY_USED = "battery_not_fully_used"

# Request/Response Models
class PasteDataRequest(BaseModel):
    data: str

class UpdateBatteryRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    datetime: List[str]

class BusConfig(BaseModel):
    bus_number: int
    bus_type: BusType
    num_houses: int = 0
    num_solar_panels: int = 0
    ev_capacity_kw: float = 0.0

class BusConfigurationRequest(BaseModel):
    buses: List[BusConfig]

class ReconstructTableRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    original_columns: List[str]
    original_data: List[Dict[str, Any]]

class BatteryConstraints(BaseModel):
    cost_per_kwh: int
    min_size_kwh: int
    max_size_kwh: int
    rounding_increment_kwh: int
    allowed_bus_types: List[BusType]

# Configuration
BATTERY_CONSTRAINTS_CONFIG = {
    BatteryType.HOME: BatteryConstraints(
        cost_per_kwh=1000,
        min_size_kwh=0,
        max_size_kwh=45,
        rounding_increment_kwh=5,
        allowed_bus_types=[BusType.RESIDENTIAL]
    ),
    BatteryType.NEIGHBORHOOD: BatteryConstraints(
        cost_per_kwh=600,
        min_size_kwh=0,
        max_size_kwh=400,
        rounding_increment_kwh=100,
        allowed_bus_types=[BusType.COMMUNITY]
    )
}

BUDGET_LIMIT_EUR = 300000

# Bus configuration storage (in-memory)
bus_configurations: Dict[int, BusConfig] = {}

DEFAULT_BUS_CONFIG = {
    1: BusConfig(bus_number=1, bus_type=BusType.PCC),
    2: BusConfig(bus_number=2, bus_type=BusType.COMMUNITY),
    3: BusConfig(bus_number=3, bus_type=BusType.RESIDENTIAL, num_houses=10, num_solar_panels=50),
    4: BusConfig(bus_number=4, bus_type=BusType.RESIDENTIAL, num_houses=45, ev_capacity_kw=24),
    5: BusConfig(bus_number=5, bus_type=BusType.RESIDENTIAL, num_houses=50, num_solar_panels=36),
    6: BusConfig(bus_number=6, bus_type=BusType.RESIDENTIAL, num_houses=20, num_solar_panels=24),
    7: BusConfig(bus_number=7, bus_type=BusType.RESIDENTIAL, num_houses=15, num_solar_panels=48, ev_capacity_kw=12),
    8: BusConfig(bus_number=8, bus_type=BusType.COMMUNITY, num_solar_panels=50),
    9: BusConfig(bus_number=9, bus_type=BusType.RESIDENTIAL, num_houses=35, num_solar_panels=64),
    10: BusConfig(bus_number=10, bus_type=BusType.RESIDENTIAL, num_houses=15, num_solar_panels=78, ev_capacity_kw=18),
    11: BusConfig(bus_number=11, bus_type=BusType.RESIDENTIAL, num_houses=10, ev_capacity_kw=12),
    12: BusConfig(bus_number=12, bus_type=BusType.RESIDENTIAL, num_houses=35, num_solar_panels=58),
    13: BusConfig(bus_number=13, bus_type=BusType.RESIDENTIAL, num_houses=80, num_solar_panels=90, ev_capacity_kw=33),
}

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

def group_battery_columns_by_bus(battery_cols: List[str]) -> Dict[int, List[str]]:
    """Group battery generator columns by bus number."""
    battery_by_bus = {}
    for col in battery_cols:
        match = re.search(r'gen\s*(\d+)', col, re.IGNORECASE)
        if match:
            bus_num = int(match.group(1))
            if bus_num not in battery_by_bus:
                battery_by_bus[bus_num] = []
            battery_by_bus[bus_num].append(col)
    return battery_by_bus

def ensure_bus_config_initialized():
    """Initialize bus configurations with defaults if not set."""
    if not bus_configurations:
        for bus_num, config in DEFAULT_BUS_CONFIG.items():
            bus_configurations[bus_num] = config

def get_bus_config(bus_num: int) -> Optional[BusConfig]:
    """Get bus configuration for a specific bus."""
    ensure_bus_config_initialized()
    return bus_configurations.get(bus_num)

def get_battery_type_for_bus(bus_type: BusType) -> Optional[BatteryType]:
    """Map bus type to battery type."""
    if bus_type == BusType.RESIDENTIAL:
        return BatteryType.HOME
    elif bus_type == BusType.COMMUNITY:
        return BatteryType.NEIGHBORHOOD
    return None

def get_battery_constraints(bus_num: int) -> Optional[BatteryConstraints]:
    """Get battery constraints for a specific bus."""
    bus_config = get_bus_config(bus_num)
    if not bus_config:
        return None
    
    battery_type = get_battery_type_for_bus(bus_config.bus_type)
    if not battery_type:
        return None
    
    return BATTERY_CONSTRAINTS_CONFIG.get(battery_type)

def round_capacity(capacity: float, rounding_increment: int) -> float:
    """Round capacity up to nearest increment."""
    # Round to 2 decimal places first to avoid floating point precision issues
    # e.g., 300.0000001 becomes 300.0, so ceil(300.0/100) = 3, not 4
    capacity_rounded = round(capacity, 2)
    return math.ceil(capacity_rounded / rounding_increment) * rounding_increment

def calculate_capacity_timeseries(bus_mw: pd.Series) -> pd.Series:
    """Calculate battery capacity over time from MW values."""
    capacity_values = [0.0]
    for i in range(len(bus_mw)):
        capacity_values.append(capacity_values[-1] - bus_mw.iloc[i])
    capacity_mwh = pd.Series(capacity_values)
    return capacity_mwh * 1000  # Convert MWh to kWh

def validate_capacity(bus_num: int, capacity_kwh: pd.Series, mw_values: pd.Series, constraints: BatteryConstraints) -> List[Dict[str, Any]]:
    """Validate battery capacity against constraints."""
    errors = []
    max_capacity = max(capacity_kwh) if len(capacity_kwh) > 0 else 0.0
    
    # Check for negative capacity (with small tolerance for floating point errors)
    TOLERANCE = 0.01  # 0.01 kWh = 10 Wh tolerance
    for timestep, capacity in enumerate(capacity_kwh):
        if capacity < -TOLERANCE:
            errors.append({
                "bus": str(bus_num),
                "timestep": timestep,
                "capacity": float(capacity),
                "error_type": ValidationErrorType.NEGATIVE_CAPACITY.value
            })
    
    # Check if exceeds max size
    if max_capacity > constraints.max_size_kwh:
        max_timestep = capacity_kwh.idxmax() if len(capacity_kwh) > 0 else 0
        errors.append({
            "bus": str(bus_num),
            "timestep": int(max_timestep),
            "capacity": float(max_capacity),
            "error_type": ValidationErrorType.ABOVE_MAX_SIZE.value,
            "min_size": constraints.min_size_kwh,
            "max_size": constraints.max_size_kwh,
            "message": f"Bus {bus_num} capacity {max_capacity:.2f} kWh exceeds maximum allowed {constraints.max_size_kwh} kWh"
        })
    
    # Check power rating constraint (1C rate: battery can charge/discharge its full capacity in 1 hour)
    # Power rating should be based on the INSTALLED capacity (rounded), not the max reached capacity
    # This avoids circular logic where the capacity depends on the power values we're validating
    rounded_capacity = round_capacity(max_capacity, constraints.rounding_increment_kwh)
    max_power_rating_mw = rounded_capacity / 1000  # Convert kWh to MWh (which is equivalent to MW for 1-hour periods)
    
    for timestep, mw in enumerate(mw_values):
        abs_mw = abs(mw)
        if abs_mw > max_power_rating_mw:
            errors.append({
                "bus": str(bus_num),
                "timestep": timestep + 1,  # timestep+1 because MW at index i affects capacity at i+1
                "capacity": float(capacity_kwh.iloc[timestep + 1] if timestep + 1 < len(capacity_kwh) else 0),
                "power": float(mw),
                "max_power_rating": float(max_power_rating_mw),
                "installed_capacity": float(rounded_capacity),
                "error_type": ValidationErrorType.EXCEEDS_POWER_RATING.value,
                "message": f"Bus {bus_num} power {abs_mw:.3f} MW exceeds battery power rating of {max_power_rating_mw:.3f} MW (installed: {rounded_capacity:.0f} kWh)"
            })
    
    return errors

def check_battery_warnings(bus_num: int, capacity_kwh: pd.Series, constraints: Optional[BatteryConstraints]) -> List[Dict[str, Any]]:
    """Check for battery warnings (non-critical issues)."""
    warnings = []
    
    if len(capacity_kwh) == 0:
        return warnings
    
    max_capacity = max(capacity_kwh) if len(capacity_kwh) > 0 else 0.0
    
    # Check if battery ends day at 0 capacity (fully discharged)
    if len(capacity_kwh) > 0:
        final_capacity = capacity_kwh.iloc[-1]
        # Only warn if there's meaningful remaining capacity (> 0.1 kWh)
        # This avoids warnings on tiny floating point residuals
        if final_capacity > 0.1:
            warnings.append({
                "bus": str(bus_num),
                "timestep": len(capacity_kwh) - 1,
                "capacity": float(final_capacity),
                "max_capacity": float(max_capacity),
                "percentage_remaining": float((final_capacity / max_capacity * 100) if max_capacity > 0 else 0),
                "error_type": ValidationErrorType.BATTERY_NOT_FULLY_USED.value,
                "message": f"Bus {bus_num} battery not at 0 at end of day: {final_capacity:.2f} kWh remaining"
            })
    
    # Check if battery capacity is significantly less than rounded capacity (due to rounding inefficiency)
    if constraints and max_capacity > 0:
        rounded_capacity = round_capacity(max_capacity, constraints.rounding_increment_kwh)
        wasted_capacity = rounded_capacity - max_capacity
        waste_percentage = (wasted_capacity / rounded_capacity) * 100
        
        # Warn if more than 10% of paid capacity is wasted due to rounding
        if waste_percentage > 10:
            warnings.append({
                "bus": str(bus_num),
                "timestep": 0,
                "capacity": float(max_capacity),
                "rounded_capacity": float(rounded_capacity),
                "wasted_capacity": float(wasted_capacity),
                "waste_percentage": float(waste_percentage),
                "error_type": "battery_underutilized_rounding",
                "message": f"Bus {bus_num} battery underutilized: using {max_capacity:.2f} kWh but paying for {rounded_capacity:.0f} kWh ({waste_percentage:.1f}% wasted due to rounding)"
            })
    
    return warnings

def calculate_cost(max_capacity: float, constraints: BatteryConstraints, battery_type: BatteryType) -> Dict[str, Any]:
    """Calculate battery cost based on capacity and constraints."""
    rounded_capacity = round_capacity(max_capacity, constraints.rounding_increment_kwh)
    return {
        "max_capacity_kwh": float(max_capacity),
        "rounded_capacity_kwh": float(rounded_capacity),
        "cost_per_kwh": constraints.cost_per_kwh,
        "total_cost_eur": float(rounded_capacity * constraints.cost_per_kwh),
        "battery_type": battery_type.value,
        "min_size_kwh": constraints.min_size_kwh,
        "max_size_kwh": constraints.max_size_kwh
    }

def calculate_battery_capacity_and_validate(df: pd.DataFrame, battery_by_bus: Dict[int, List[str]]) -> tuple:
    """
    Calculate battery capacity for each bus and validate constraints.
    Returns (battery_capacity dict, validation_errors list, costs dict)
    """
    battery_capacity = {}
    validation_errors = []
    costs = {}
    
    for bus_num, gen_names in battery_by_bus.items():
        bus_mw = df[gen_names].sum(axis=1)
        capacity_kwh = calculate_capacity_timeseries(bus_mw)
        
        # Store capacity timeseries
        battery_capacity[str(bus_num)] = capacity_kwh.tolist()
        
        # Get constraints and validate
        constraints = get_battery_constraints(bus_num)
        if constraints:
            bus_config = get_bus_config(bus_num)
            battery_type = get_battery_type_for_bus(bus_config.bus_type) if bus_config else None
            
            if battery_type:
                # Validate capacity (pass bus_mw for power rating validation)
                errors = validate_capacity(bus_num, capacity_kwh, bus_mw, constraints)
                validation_errors.extend(errors)
                
                # Only check for warnings if there are no errors for this bus
                # (warnings don't make sense if the configuration is already invalid)
                if len(errors) == 0:
                    warnings = check_battery_warnings(bus_num, capacity_kwh, constraints)
                    validation_errors.extend(warnings)
                
                # Calculate cost
                max_capacity = max(capacity_kwh) if len(capacity_kwh) > 0 else 0.0
                costs[str(bus_num)] = calculate_cost(max_capacity, constraints, battery_type)
    
    return battery_capacity, validation_errors, costs

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

def parse_lines_to_dataframe(text: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Parse raw lines data and return two DataFrames: one for % MVA Limit, one for MW From.
    Returns (mva_limit_df, mw_from_df) where mw_from_df may be empty if MW columns don't exist.
    """
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
    df = df.reset_index(drop=True)
    
    # Separate columns into MVA Limit (%) and MW From
    base_cols = ['Date', 'Time', 'Skip']
    mva_limit_cols = base_cols + [col for col in df.columns if '% of mva limit from' in col.lower()]
    mw_from_cols = base_cols + [col for col in df.columns if 'mw from' in col.lower() and '% of mva' not in col.lower()]
    
    # Create MVA Limit dataframe
    mva_limit_df = df[mva_limit_cols].copy()
    for col in mva_limit_df.columns:
        if col not in base_cols:
            mva_limit_df[col] = pd.to_numeric(mva_limit_df[col], errors='coerce').fillna(0.0)
    
    # Create MW From dataframe (may be empty if columns don't exist)
    if len(mw_from_cols) > len(base_cols):
        mw_from_df = df[mw_from_cols].copy()
        for col in mw_from_df.columns:
            if col not in base_cols:
                mw_from_df[col] = pd.to_numeric(mw_from_df[col], errors='coerce').fillna(0.0)
    else:
        # No MW From columns found, return empty dataframe with same structure as MVA Limit
        mw_from_df = pd.DataFrame(columns=base_cols)
        if len(mva_limit_df) > 0:
            mw_from_df['Date'] = mva_limit_df['Date'].copy()
            mw_from_df['Time'] = mva_limit_df['Time'].copy()
            if 'Skip' in mva_limit_df.columns:
                mw_from_df['Skip'] = mva_limit_df['Skip'].copy()
    
    return mva_limit_df, mw_from_df

@app.post("/api/analyze/lines")
async def analyze_lines(request: PasteDataRequest):
    try:
        mva_limit_df, mw_from_df = parse_lines_to_dataframe(request.data)
        df = mva_limit_df  # Use MVA Limit dataframe for existing logic
        
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
        
        # Calculate main line (1->2) specific metrics
        # Column can be either "1 (1) TO 2 (2) CKT..." or "1  TO  2 CKT..."
        main_line_col = None
        for col in branch_columns:
            col_normalized = ' '.join(col.upper().split())  # Normalize whitespace
            # Check for patterns like "1 TO 2" or "1 (1) TO 2 (2)"
            if (col_normalized.startswith('1 ') and ' TO 2 ' in col_normalized) or \
               (col_normalized.startswith('1 (1) ') and ' TO 2 (2) ' in col_normalized):
                main_line_col = col
                break
        
        main_line_below_90 = False
        main_line_flatness = None
        
        logging.info(f"Main line column found: {main_line_col}")
        
        if main_line_col and main_line_col in df.columns:
            main_line_values = [float(v) for v in df[main_line_col].tolist() if pd.notna(v)]
            if main_line_values:
                logging.info(f"Main line values: min={min(main_line_values):.2f}, max={max(main_line_values):.2f}, count={len(main_line_values)}")
                
                # Check if all values are below 90%
                main_line_below_90 = all(v < 90 for v in main_line_values)
                
                # Log any values >= 90
                high_values = [v for v in main_line_values if v >= 90]
                if high_values:
                    logging.info(f"Main line has {len(high_values)} values >= 90%: {high_values}")
                
                # Calculate flatness (coefficient of variation)
                mean = sum(main_line_values) / len(main_line_values)
                if mean > 0:
                    variance = sum((v - mean) ** 2 for v in main_line_values) / len(main_line_values)
                    std_dev = variance ** 0.5
                    main_line_flatness = (std_dev / mean) * 100
                else:
                    main_line_flatness = 0.0
        else:
            logging.warning(f"Main line column not found. Branch columns: {branch_columns[:3]}...")
        
        # Process MW From data (if available) and detect reverse power flow
        mw_from_branches = {}
        mw_from_branch_names = []
        reverse_flow_errors = []
        branches_with_reverse_flow = set()
        
        if len(mw_from_df.columns) > len(base_cols := ['Date', 'Time', 'Skip']):
            mw_from_columns = [col for col in mw_from_df.columns if col not in ['Date', 'Time', 'Skip']]
            for col in mw_from_columns:
                match = re.search(r'(\d+)\s+\([^)]+\)\s+TO\s+(\d+)\s+\([^)]+\)', col)
                if not match:
                    match = re.search(r'(\d+)\s+TO\s+(\d+)', col)
                branch_name = f"{match.group(1)}-{match.group(2)}" if match else col
                branch_values = mw_from_df[col].tolist()
                mw_from_branches[branch_name] = branch_values
                mw_from_branch_names.append(branch_name)
                
                # Check for reverse power flow (negative MW values)
                branch_has_reverse_flow = False
                min_mw_value = None
                for mw_value in branch_values:
                    if pd.notna(mw_value) and mw_value < 0:
                        branch_has_reverse_flow = True
                        if min_mw_value is None or mw_value < min_mw_value:
                            min_mw_value = mw_value
                
                # Create one error per branch with reverse flow
                if branch_has_reverse_flow:
                    branches_with_reverse_flow.add(branch_name)
                    reverse_flow_errors.append({
                        "branch": branch_name,
                        "min_mw": float(min_mw_value),
                        "error_type": "reverse_power_flow",
                        "message": f"Branch {branch_name}: Reverse power flow detected (min: {min_mw_value:.3f} MW)"
                    })
        
        return {
            "data": {
                "datetime": datetimes,
                "branches": branches
            },
            "statistics": stats,
            "branch_names": list(branches.keys()),
            "main_line_below_90": main_line_below_90,
            "main_line_flatness": main_line_flatness,
            "mw_from_data": {
                "datetime": datetimes,
                "branches": mw_from_branches
            },
            "mw_from_branch_names": mw_from_branch_names,
            "reverse_flow_errors": reverse_flow_errors,
            "branches_with_reverse_flow_count": len(branches_with_reverse_flow)
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
        battery_by_bus = group_battery_columns_by_bus(battery_columns)
        
        # Calculate battery capacity and validate
        battery_capacity, validation_errors, costs = calculate_battery_capacity_and_validate(df, battery_by_bus)
        
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
        
        # Calculate budget summary
        total_cost = sum(cost["total_cost_eur"] for cost in costs.values())
        budget_summary = {
            "total_cost_eur": total_cost,
            "budget_limit_eur": BUDGET_LIMIT_EUR,
            "percentage_used": (total_cost / BUDGET_LIMIT_EUR * 100) if BUDGET_LIMIT_EUR > 0 else 0,
            "is_over_budget": total_cost > BUDGET_LIMIT_EUR
        }
        
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
            },
            "validation_errors": validation_errors,
            "battery_costs": costs,
            "budget_summary": budget_summary
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
        battery_by_bus = group_battery_columns_by_bus(battery_cols)
        
        # Calculate capacity and validate
        battery_capacity, validation_errors, costs = calculate_battery_capacity_and_validate(df, battery_by_bus)
        
        # Calculate budget summary
        total_cost = sum(cost["total_cost_eur"] for cost in costs.values())
        budget_summary = {
            "total_cost_eur": total_cost,
            "budget_limit_eur": BUDGET_LIMIT_EUR,
            "percentage_used": (total_cost / BUDGET_LIMIT_EUR * 100) if BUDGET_LIMIT_EUR > 0 else 0,
            "is_over_budget": total_cost > BUDGET_LIMIT_EUR
        }
        
        return {
            "battery_capacity": battery_capacity,
            "validation_errors": validation_errors,
            "battery_costs": costs,
            "budget_summary": budget_summary
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating battery capacity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating battery capacity: {str(e)}")

@app.get("/api/bus-config")
async def get_bus_config_api():
    """Get current bus configuration."""
    if not bus_configurations:
        # Initialize with defaults
        for bus_num, config in DEFAULT_BUS_CONFIG.items():
            bus_configurations[bus_num] = config
    return {"buses": [config.dict() for config in bus_configurations.values()]}

@app.post("/api/bus-config")
async def set_bus_config(request: BusConfigurationRequest):
    """Update bus configuration."""
    global bus_configurations
    bus_configurations = {config.bus_number: config for config in request.buses}
    return {"message": "Bus configuration updated", "buses": [config.dict() for config in bus_configurations.values()]}

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

