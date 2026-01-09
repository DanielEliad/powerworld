import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd

from models import BusType, BatteryType, BusConfig
from config import (
    BATTERY_CONSTRAINTS, DEFAULT_BUS_CONFIG, BUDGET_LIMIT_EUR,
    LOAD_COST_PER_KWH_EUR, DEFAULT_LOAD_MW, DEFAULT_LOAD_MVAR
)
from parsing import (
    parse_generators, parse_loads, parse_lines, parse_buses,
    extract_datetimes, extract_branch_name, group_battery_columns_by_bus, group_loads_by_bus
)
from validation import (
    calculate_capacity_timeseries, validate_battery_capacity, check_battery_warnings,
    validate_bus_voltages, validate_load_energy_conservation, validate_load_pq_sync,
    detect_reverse_power_flow, calculate_battery_cost
)


class BusConfigManager:
    def __init__(self):
        self._configs: Dict[int, BusConfig] = {}

    def _ensure_initialized(self):
        if not self._configs:
            self._configs = dict(DEFAULT_BUS_CONFIG)

    def get(self, bus_num: int) -> Optional[BusConfig]:
        self._ensure_initialized()
        return self._configs.get(bus_num)


class LoadDataStore:
    def __init__(self):
        self.default_mw: str = DEFAULT_LOAD_MW  # Original pasted MW data
        self.default_mvar: str = DEFAULT_LOAD_MVAR  # Original pasted MVar data
        self.current_mw: str = DEFAULT_LOAD_MW  # Current working MW data
        self.current_mvar: str = DEFAULT_LOAD_MVAR  # Current working MVar data
        self.current_load_cost_eur: float = 0.0


bus_config_manager = BusConfigManager()
load_store = LoadDataStore()


def get_battery_type_for_bus(bus_type: BusType) -> Optional[BatteryType]:
    if bus_type == BusType.RESIDENTIAL:
        return BatteryType.HOME
    elif bus_type == BusType.COMMUNITY:
        return BatteryType.NEIGHBORHOOD
    return None


def get_battery_constraints_for_bus(bus_num: int):
    bus_config = bus_config_manager.get(bus_num)
    if not bus_config:
        return None

    battery_type = get_battery_type_for_bus(bus_config.bus_type)
    if not battery_type:
        return None

    return BATTERY_CONSTRAINTS.get(battery_type), battery_type


def calculate_battery_capacity_and_costs(
    df: pd.DataFrame,
    battery_by_bus: Dict[int, List[str]]
) -> Tuple[Dict[str, List[float]], List[Dict], Dict[str, Dict]]:
    battery_capacity = {}
    validation_errors = []
    costs = {}

    for bus_num, gen_names in battery_by_bus.items():
        bus_mw = df[gen_names].sum(axis=1)
        capacity_kwh = calculate_capacity_timeseries(bus_mw)
        battery_capacity[str(bus_num)] = capacity_kwh.tolist()

        result = get_battery_constraints_for_bus(bus_num)
        if not result:
            continue

        constraints, battery_type = result

        errors = validate_battery_capacity(bus_num, capacity_kwh, bus_mw, constraints)
        validation_errors.extend(errors)

        if not errors:
            warnings = check_battery_warnings(bus_num, capacity_kwh, constraints)
            validation_errors.extend(warnings)

        max_capacity = max(capacity_kwh) if len(capacity_kwh) > 0 else 0.0
        costs[str(bus_num)] = calculate_battery_cost(max_capacity, constraints, battery_type)

    return battery_capacity, validation_errors, costs


def calculate_budget_summary(battery_costs: Dict, load_cost_eur: float = 0.0) -> Dict[str, Any]:
    battery_cost = sum(c["total_cost_eur"] for c in battery_costs.values())
    total_cost = battery_cost + load_cost_eur

    return {
        "total_cost_eur": total_cost,
        "budget_limit_eur": BUDGET_LIMIT_EUR,
        "percentage_used": (total_cost / BUDGET_LIMIT_EUR * 100) if BUDGET_LIMIT_EUR > 0 else 0,
        "is_over_budget": total_cost > BUDGET_LIMIT_EUR,
        "battery_cost_eur": battery_cost,
        "load_cost_eur": load_cost_eur
    }


def analyze_lines(text: str) -> Dict[str, Any]:
    mva_limit_df, mw_from_df = parse_lines(text)
    datetimes = extract_datetimes(mva_limit_df)

    base_cols = ['Date', 'Time', 'Skip']
    branch_columns = [col for col in mva_limit_df.columns
                      if '% of mva limit' in col.lower() and col not in base_cols]

    if not branch_columns:
        raise ValueError("No branch columns found in data")

    branches = {}
    for col in branch_columns:
        branch_name = extract_branch_name(col)
        branches[branch_name] = mva_limit_df[col].tolist()

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

    main_line_col = None
    for col in branch_columns:
        col_normalized = ' '.join(col.upper().split())
        if (col_normalized.startswith('1 ') and ' TO 2 ' in col_normalized) or \
           (col_normalized.startswith('1 (1) ') and ' TO 2 (2) ' in col_normalized):
            main_line_col = col
            break

    main_line_below_90 = False
    main_line_flatness = None

    if main_line_col and main_line_col in mva_limit_df.columns:
        main_line_values = [float(v) for v in mva_limit_df[main_line_col].tolist() if pd.notna(v)]
        if main_line_values:
            main_line_below_90 = all(v < 90 for v in main_line_values)
            mean = sum(main_line_values) / len(main_line_values)
            if mean > 0:
                variance = sum((v - mean) ** 2 for v in main_line_values) / len(main_line_values)
                main_line_flatness = (variance ** 0.5 / mean) * 100

    # Check main transformer (1->2) reverse flow (requires "MW From" columns)
    main_transformer_reverse_flow = None
    reverse_flow_errors = []
    mw_from_columns = [col for col in mw_from_df.columns if col not in base_cols]
    
    if mw_from_columns:
        # We have MW From data, check for reverse flow on branch 1-2
        main_transformer_reverse_flow = False
        for col in mw_from_columns:
            branch_name = extract_branch_name(col)
            if branch_name == "1-2":
                values = mw_from_df[col].tolist()
                # Check if any value is negative (reverse flow)
                error = detect_reverse_power_flow(values, branch_name)
                if error:
                    reverse_flow_errors.append(error)
                    main_transformer_reverse_flow = True
                break

    return {
        "data": {"datetime": datetimes, "branches": branches},
        "statistics": stats,
        "branch_names": list(branches.keys()),
        "main_line_below_90": main_line_below_90,
        "main_line_flatness": main_line_flatness,
        "main_transformer_reverse_flow": main_transformer_reverse_flow,
        "reverse_flow_errors": reverse_flow_errors
    }


def analyze_buses(text: str) -> Dict[str, Any]:
    df = parse_buses(text)

    if 'Date' not in df.columns or 'Time' not in df.columns:
        raise ValueError("Date and Time columns are required")

    datetimes = extract_datetimes(df)

    voltage_cols = [col for col in df.columns if 'PU Volt' in col]

    bus_numbers = []
    buses_dict = {}
    statistics_dict = {}

    for col in voltage_cols:
        bus_match = re.match(r'(\d+)\s+PU Volt', col)
        if bus_match:
            bus_num = bus_match.group(1)
            bus_numbers.append(bus_num)

            values = df[col].tolist()
            buses_dict[bus_num] = values

            numeric_values = [v for v in values if pd.notna(v)]
            if numeric_values:
                statistics_dict[bus_num] = {
                    "min": float(min(numeric_values)),
                    "max": float(max(numeric_values)),
                    "avg": float(sum(numeric_values) / len(numeric_values))
                }

    voltage_errors = validate_bus_voltages(df)
    buses_with_violations = len(set(error["bus"] for error in voltage_errors))

    return {
        "data": {"datetime": datetimes, "buses": buses_dict},
        "bus_numbers": bus_numbers,
        "statistics": statistics_dict,
        "voltage_errors": voltage_errors,
        "buses_with_violations_count": buses_with_violations
    }


def analyze_generators(text: str, load_cost_eur: float = 0.0) -> Dict[str, Any]:
    df = parse_generators(text)

    if 'Date' not in df.columns or 'Time' not in df.columns:
        raise ValueError("Date and Time columns are required")

    datetimes = extract_datetimes(df)

    if datetimes and datetimes[-1]:
        last_dt = datetime.fromisoformat(datetimes[-1])
        next_day = last_dt.replace(hour=0, minute=0, second=0)
        if next_day <= last_dt:
            next_day = next_day + timedelta(days=1)
        datetimes.append(next_day.isoformat())

    gen_columns = [col for col in df.columns
                   if col.lower().startswith('gen') and 'mw' in col.lower()
                   and 'gen 1 #1' not in col.lower()]

    battery_columns = [col for col in gen_columns if '#bt' in col.lower()]
    battery_by_bus = group_battery_columns_by_bus(battery_columns)

    battery_capacity, validation_errors, costs = calculate_battery_capacity_and_costs(df, battery_by_bus)

    battery_table_cols = ['Date', 'Time'] + battery_columns
    battery_table_df = df[battery_table_cols].copy()

    battery_table_metadata = {}
    for bus_num, gen_names in battery_by_bus.items():
        for gen_name in gen_names:
            battery_table_metadata[gen_name] = str(bus_num)

    generators_dict = {col: df[col].tolist() for col in gen_columns}

    budget_summary = calculate_budget_summary(costs, load_cost_eur)

    return {
        "columns": df.columns.tolist(),
        "rows": df.values.tolist(),
        "data": df.to_dict('records'),
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


def _parse_load_data(text: Optional[str], col_key: str) -> Tuple[Optional[pd.DataFrame], Dict[str, List[float]], List[str], Dict]:
    if not text or not text.strip():
        return None, {}, [], {}

    df = parse_loads(text)
    datetimes = extract_datetimes(df)
    load_by_bus = group_loads_by_bus(df)

    data = {}
    for bus_num, cols in load_by_bus.items():
        col = cols.get(col_key)
        if col:
            data[str(bus_num)] = df[col].tolist()

    return df, data, datetimes, load_by_bus


def analyze_loads(mw_text: Optional[str], mvar_text: Optional[str]) -> Dict[str, Any]:
    validation_errors = []
    has_mw = bool(mw_text and mw_text.strip())
    has_mvar = bool(mvar_text and mvar_text.strip())

    if not has_mw and not has_mvar:
        raise ValueError("At least one of loads_mw_data or loads_mvar_data must be provided")

    new_mw_df, new_mw_data, mw_datetimes, mw_load_by_bus = _parse_load_data(mw_text, "mw_col")
    new_mvar_df, new_mvar_data, mvar_datetimes, mvar_load_by_bus = _parse_load_data(mvar_text, "mvar_col")

    if has_mw and has_mvar:
        validation_errors.extend(validate_load_pq_sync(mw_load_by_bus, mvar_load_by_bus))

    datetimes = mw_datetimes if mw_datetimes else mvar_datetimes
    df_to_use = new_mw_df if new_mw_df is not None else new_mvar_df

    is_first_paste = not load_store.default_mw or not load_store.default_mvar

    if is_first_paste:
        if has_mw and not load_store.default_mw:
            load_store.default_mw = mw_text
            load_store.current_mw = mw_text
        if has_mvar and not load_store.default_mvar:
            load_store.default_mvar = mvar_text
            load_store.current_mvar = mvar_text

        combined_load_by_bus = _combine_load_by_bus(mw_load_by_bus, mvar_load_by_bus)

        return {
            "columns": df_to_use.columns.tolist(),
            "rows": df_to_use.values.tolist(),
            "data": df_to_use.to_dict("records"),
            "datetime": datetimes,
            "load_columns": [col for col in df_to_use.columns if col not in ["Date", "Time"]],
            "load_by_bus": combined_load_by_bus,
            "mw_data": new_mw_data,
            "mvar_data": new_mvar_data,
            "original_mw_data": new_mw_data,  # On first paste, original = current
            "differences": {},
            "energy_moved_kwh": {},
            "load_cost_eur": 0.0,
            "validation_errors": validation_errors,
            "is_first_paste": True
        }

    default_mw_df = parse_loads(load_store.default_mw)
    default_mvar_df = parse_loads(load_store.default_mvar)

    default_mw_load_by_bus = group_loads_by_bus(default_mw_df)
    default_mvar_load_by_bus = group_loads_by_bus(default_mvar_df)

    default_mw_data: Dict[str, List[float]] = {}
    default_mvar_data: Dict[str, List[float]] = {}

    for bus_num, cols in default_mw_load_by_bus.items():
        if cols["mw_col"]:
            default_mw_data[str(bus_num)] = default_mw_df[cols["mw_col"]].tolist()

    for bus_num, cols in default_mvar_load_by_bus.items():
        if cols["mvar_col"]:
            default_mvar_data[str(bus_num)] = default_mvar_df[cols["mvar_col"]].tolist()

    combined_mw_data = new_mw_data if has_mw else default_mw_data.copy()
    combined_mvar_data = new_mvar_data if has_mvar else default_mvar_data.copy()

    differences: Dict[str, Dict[str, List[float]]] = {}
    energy_moved_kwh: Dict[str, float] = {}

    if has_mw:
        for bus_str, new_values in new_mw_data.items():
            if bus_str not in default_mw_data:
                continue

            default_values = default_mw_data[bus_str]
            errors = validate_load_energy_conservation(int(bus_str), new_values, default_values, "mw")
            validation_errors.extend(errors)

            if not errors:
                mw_diff = [new_values[i] - default_values[i] for i in range(len(new_values))]
                differences.setdefault(bus_str, {"mw": [], "mvar": []})["mw"] = mw_diff

    if has_mvar:
        for bus_str, new_values in new_mvar_data.items():
            if bus_str not in default_mvar_data:
                continue

            default_values = default_mvar_data[bus_str]
            errors = validate_load_energy_conservation(int(bus_str), new_values, default_values, "mvar")
            validation_errors.extend(errors)

            if not errors:
                mvar_diff = [new_values[i] - default_values[i] for i in range(len(new_values))]
                differences.setdefault(bus_str, {"mw": [], "mvar": []})["mvar"] = mvar_diff

    for bus_str, diff in differences.items():
        if diff.get("mw"):
            # Convert MW to kWh: MW * 1 hour = MWh, then MWh * 1000 = kWh
            # Divide by 2 because each move is counted twice (from source and to destination)
            energy_moved_kwh[bus_str] = sum(abs(d) for d in diff["mw"]) / 2.0 * 1000

    total_energy_moved = sum(energy_moved_kwh.values())
    load_cost_eur = total_energy_moved * LOAD_COST_PER_KWH_EUR
    load_store.current_load_cost_eur = load_cost_eur

    combined_load_by_bus = _combine_load_by_bus(mw_load_by_bus, mvar_load_by_bus)

    return {
        "columns": df_to_use.columns.tolist(),
        "rows": df_to_use.values.tolist(),
        "data": df_to_use.to_dict("records"),
        "datetime": datetimes,
        "load_columns": [col for col in df_to_use.columns if col not in ["Date", "Time"]],
        "load_by_bus": combined_load_by_bus,
        "mw_data": combined_mw_data,
        "mvar_data": combined_mvar_data,
        "original_mw_data": default_mw_data,  # For frontend to show modified state
        "differences": differences,
        "energy_moved_kwh": energy_moved_kwh,
        "load_cost_eur": load_cost_eur,
        "validation_errors": validation_errors,
        "is_first_paste": False
    }


def _combine_load_by_bus(mw_load_by_bus: Dict, mvar_load_by_bus: Dict) -> Dict[str, Dict]:
    combined = {}

    for bus_num, cols in mw_load_by_bus.items():
        combined[str(bus_num)] = {"mw_col": cols.get("mw_col"), "mvar_col": None}

    for bus_num, cols in mvar_load_by_bus.items():
        key = str(bus_num)
        if key in combined:
            combined[key]["mvar_col"] = cols.get("mvar_col")
        else:
            combined[key] = {"mw_col": None, "mvar_col": cols.get("mvar_col")}

    return combined


def update_battery_capacity(battery_table_data: List[Dict], datetimes: List[str]) -> Dict[str, Any]:
    df = pd.DataFrame(battery_table_data)
    battery_cols = [col for col in df.columns if col not in ['Date', 'Time']]
    battery_by_bus = group_battery_columns_by_bus(battery_cols)

    battery_capacity, validation_errors, costs = calculate_battery_capacity_and_costs(df, battery_by_bus)
    budget_summary = calculate_budget_summary(costs, load_store.current_load_cost_eur)

    return {
        "battery_capacity": battery_capacity,
        "validation_errors": validation_errors,
        "battery_costs": costs,
        "budget_summary": budget_summary
    }


def analyze_all(
    lines_data: Optional[str],
    generators_data: Optional[str],
    buses_data: Optional[str],
    loads_mw_data: Optional[str],
    loads_mvar_data: Optional[str]
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "lines": None,
        "generators": None,
        "buses": None,
        "loads": None,
        "budget_summary": None
    }

    if lines_data:
        result["lines"] = analyze_lines(lines_data)

    load_cost_eur = 0.0
    if loads_mw_data or loads_mvar_data:
        loads_result = analyze_loads(loads_mw_data, loads_mvar_data)
        result["loads"] = loads_result
        load_cost_eur = loads_result.get("load_cost_eur", 0.0)

    if generators_data:
        gen_result = analyze_generators(generators_data, load_cost_eur)
        result["generators"] = gen_result
        result["budget_summary"] = gen_result.get("budget_summary")

    if buses_data:
        result["buses"] = analyze_buses(buses_data)

    return result


def apply_load_moves(operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not load_store.current_mw:
        raise ValueError("No current MW load data available")
    
    # Parse current working data
    mw_df = parse_loads(load_store.current_mw)
    mvar_df = parse_loads(load_store.current_mvar) if load_store.current_mvar else None
    
    mw_load_by_bus = group_loads_by_bus(mw_df)
    mvar_load_by_bus = group_loads_by_bus(mvar_df) if mvar_df is not None else {}
    
    # Apply each move operation
    for op in operations:
        bus_id = op['bus_id']
        from_idx = op['from_index']
        to_idx = op['to_index']
        mw_value = op['mw_value']
        
        bus_num = int(bus_id)
        
        # Get MW column name
        mw_col = mw_load_by_bus.get(bus_num, {}).get('mw_col')
        if not mw_col:
            continue
        
        # Get the corresponding MVar value from the same slot
        # We move the entire active and reactive power together
        mvar_col = mvar_load_by_bus.get(bus_num, {}).get('mvar_col') if mvar_df is not None else None
        
        # Get the original MVar value at the from_idx
        if mvar_col:
            original_mvar_from = mvar_df.loc[from_idx, mvar_col]
            # Move the exact MVar value that was at the from slot
            mvar_value = original_mvar_from
        else:
            mvar_value = 0
            
        # Move MW value
        mw_df.loc[from_idx, mw_col] = mw_df.loc[from_idx, mw_col] - mw_value
        mw_df.loc[to_idx, mw_col] = mw_df.loc[to_idx, mw_col] + mw_value
        
        # Move MVar value (the entire value from the slot)
        if mvar_col:
            mvar_df.loc[from_idx, mvar_col] = mvar_df.loc[from_idx, mvar_col] - mvar_value
            mvar_df.loc[to_idx, mvar_col] = mvar_df.loc[to_idx, mvar_col] + mvar_value
    
    # Reconstruct paste strings
    def df_to_paste_string(df: pd.DataFrame) -> str:
        lines = ["Timepoint"]
        header = '\t'.join(df.columns)
        lines.append(header)
        
        for _, row in df.iterrows():
            line = '\t'.join(str(row[col]) for col in df.columns)
            lines.append(line)
        
        return '\n'.join(lines)
    
    mw_paste_string = df_to_paste_string(mw_df)
    mvar_paste_string = df_to_paste_string(mvar_df) if mvar_df is not None else None
    
    # Update the current working data
    load_store.current_mw = mw_paste_string
    if mvar_paste_string:
        load_store.current_mvar = mvar_paste_string
    
    # Extract MW data for frontend
    current_mw_data: Dict[str, List[float]] = {}
    for bus_num, cols in mw_load_by_bus.items():
        col = cols.get('mw_col')
        if col:
            current_mw_data[str(bus_num)] = mw_df[col].tolist()
    
    # Parse original default data for comparison
    original_mw_df = parse_loads(load_store.default_mw)
    original_mw_load_by_bus = group_loads_by_bus(original_mw_df)
    original_mw_data: Dict[str, List[float]] = {}
    for bus_num, cols in original_mw_load_by_bus.items():
        col = cols.get('mw_col')
        if col:
            original_mw_data[str(bus_num)] = original_mw_df[col].tolist()
    
    # Calculate load cost based on differences from original
    energy_moved_kwh: Dict[str, float] = {}
    for bus_str, current_values in current_mw_data.items():
        if bus_str in original_mw_data:
            original_values = original_mw_data[bus_str]
            if len(current_values) == len(original_values):
                differences = [current_values[i] - original_values[i] for i in range(len(current_values))]
                # Convert MW to kWh: MW * 1 hour = MWh, then MWh * 1000 = kWh
                # Divide by 2 because each move is counted twice (from source and to destination)
                energy_moved_kwh[bus_str] = sum(abs(d) for d in differences) / 2.0 * 1000
    
    total_energy_moved = sum(energy_moved_kwh.values())
    load_cost_eur = total_energy_moved * LOAD_COST_PER_KWH_EUR
    load_store.current_load_cost_eur = load_cost_eur
    
    return {
        "loads_mw_paste": mw_paste_string,
        "loads_mvar_paste": mvar_paste_string,
        "current_mw_data": current_mw_data,
        "original_mw_data": original_mw_data,
        "load_cost_eur": load_cost_eur
    }


def reset_load_moves() -> Dict[str, Any]:
    if not load_store.default_mw:
        raise ValueError("No default MW load data available")
    
    # Reset current to default
    load_store.current_mw = load_store.default_mw
    load_store.current_mvar = load_store.default_mvar
    load_store.current_load_cost_eur = 0.0
    
    # Parse and extract MW data
    mw_df = parse_loads(load_store.default_mw)
    mw_load_by_bus = group_loads_by_bus(mw_df)
    
    current_mw_data: Dict[str, List[float]] = {}
    for bus_num, cols in mw_load_by_bus.items():
        col = cols.get('mw_col')
        if col:
            current_mw_data[str(bus_num)] = mw_df[col].tolist()
    
    return {
        "loads_mw_paste": load_store.default_mw,
        "loads_mvar_paste": load_store.default_mvar,
        "current_mw_data": current_mw_data,
        "original_mw_data": current_mw_data  # After reset, current = original
    }
