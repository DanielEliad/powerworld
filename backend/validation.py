import math
import re
from typing import List, Dict, Any, Optional
import pandas as pd

from models import ValidationErrorType, BatteryConstraints, BatteryType
from config import VOLTAGE_MIN_PU, VOLTAGE_MAX_PU, CAPACITY_TOLERANCE_KWH, ENERGY_TOLERANCE_MW


def round_capacity(capacity: float, rounding_increment: int) -> float:
    capacity_rounded = round(capacity, 2)
    return math.ceil(capacity_rounded / rounding_increment) * rounding_increment


def calculate_capacity_timeseries(bus_mw: pd.Series) -> pd.Series:
    capacity_values = [0.0]
    for mw in bus_mw:
        capacity_values.append(capacity_values[-1] - mw)
    return pd.Series(capacity_values) * 1000


def validate_battery_capacity(
    bus_num: int,
    capacity_kwh: pd.Series,
    mw_values: pd.Series,
    constraints: BatteryConstraints
) -> List[Dict[str, Any]]:
    errors = []
    max_capacity = max(capacity_kwh) if len(capacity_kwh) > 0 else 0.0

    for timestep, capacity in enumerate(capacity_kwh):
        if capacity < -CAPACITY_TOLERANCE_KWH:
            errors.append({
                "bus": str(bus_num),
                "timestep": timestep,
                "capacity": float(capacity),
                "error_type": ValidationErrorType.NEGATIVE_CAPACITY.value
            })

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

    rounded_capacity = round_capacity(max_capacity, constraints.rounding_increment_kwh)
    max_power_rating_mw = rounded_capacity / 1000

    for timestep, mw in enumerate(mw_values):
        if abs(mw) > max_power_rating_mw:
            errors.append({
                "bus": str(bus_num),
                "timestep": timestep + 1,
                "capacity": float(capacity_kwh.iloc[timestep + 1] if timestep + 1 < len(capacity_kwh) else 0),
                "power": float(mw),
                "max_power_rating": float(max_power_rating_mw),
                "installed_capacity": float(rounded_capacity),
                "error_type": ValidationErrorType.EXCEEDS_POWER_RATING.value,
                "message": f"Bus {bus_num} power {abs(mw):.3f} MW exceeds 1C rate limit of {max_power_rating_mw:.3f} MW (battery: {rounded_capacity:.0f} kWh)"
            })

    return errors


def check_battery_warnings(
    bus_num: int,
    capacity_kwh: pd.Series,
    constraints: Optional[BatteryConstraints]
) -> List[Dict[str, Any]]:
    warnings = []

    if len(capacity_kwh) == 0:
        return warnings

    max_capacity = max(capacity_kwh)
    final_capacity = capacity_kwh.iloc[-1]

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

    if constraints and max_capacity > 0:
        rounded_capacity = round_capacity(max_capacity, constraints.rounding_increment_kwh)
        wasted_capacity = rounded_capacity - max_capacity
        waste_percentage = (wasted_capacity / rounded_capacity) * 100

        if waste_percentage > 10:
            warnings.append({
                "bus": str(bus_num),
                "timestep": 0,
                "capacity": float(max_capacity),
                "rounded_capacity": float(rounded_capacity),
                "wasted_capacity": float(wasted_capacity),
                "waste_percentage": float(waste_percentage),
                "error_type": ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING.value,
                "message": f"Bus {bus_num} battery underutilized: using {max_capacity:.2f} kWh but paying for {rounded_capacity:.0f} kWh ({waste_percentage:.1f}% wasted due to rounding)"
            })

    return warnings


def validate_bus_voltages(df: pd.DataFrame) -> List[Dict[str, Any]]:
    errors = []
    voltage_cols = [col for col in df.columns if 'PU Volt' in col]

    for col in voltage_cols:
        bus_match = re.match(r'(\d+)\s+PU Volt', col)
        if not bus_match:
            continue

        bus_num = bus_match.group(1)

        for idx, voltage in enumerate(df[col]):
            if pd.notna(voltage):
                if voltage < VOLTAGE_MIN_PU or voltage > VOLTAGE_MAX_PU:
                    errors.append({
                        "bus": bus_num,
                        "timestep": idx,
                        "voltage": float(voltage),
                        "error_type": ValidationErrorType.VOLTAGE_VIOLATION.value,
                        "message": f"Bus {bus_num} - Timestep {idx}: Voltage = {voltage:.3f} p.u. (must be between {VOLTAGE_MIN_PU} and {VOLTAGE_MAX_PU})"
                    })

    return errors


def validate_load_energy_conservation(
    bus_num: int,
    new_values: List[float],
    default_values: List[float],
    load_type: str
) -> List[Dict[str, Any]]:
    errors = []

    if len(new_values) != len(default_values):
        errors.append({
            "bus": str(bus_num),
            "error_type": ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED.value,
            "message": f"Bus {bus_num}: Data length mismatch. Default: {len(default_values)} rows, New: {len(new_values)} rows"
        })
        return errors

    total_default = sum(default_values)
    total_new = sum(new_values)

    if abs(total_new - total_default) > ENERGY_TOLERANCE_MW:
        unit = "MW" if load_type == "mw" else "MVar"
        errors.append({
            "bus": str(bus_num),
            "error_type": ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED.value,
            "message": f"Bus {bus_num}: Total {unit} energy must remain constant. Default: {total_default:.3f}, New: {total_new:.3f}"
        })

    return errors


def validate_load_pq_sync(
    mw_load_by_bus: Dict[int, Dict[str, Optional[str]]],
    mvar_load_by_bus: Dict[int, Dict[str, Optional[str]]]
) -> List[Dict[str, Any]]:
    errors = []

    for bus_num, cols in mw_load_by_bus.items():
        if cols.get('mw_col') and bus_num not in mvar_load_by_bus:
            errors.append({
                "bus": str(bus_num),
                "error_type": ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED.value,
                "message": f"Bus {bus_num}: Has MW column but missing MVar column for #EV load"
            })
        elif cols.get('mw_col') and not mvar_load_by_bus.get(bus_num, {}).get('mvar_col'):
            errors.append({
                "bus": str(bus_num),
                "error_type": ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED.value,
                "message": f"Bus {bus_num}: Has MW column but missing MVar column for #EV load"
            })

    for bus_num, cols in mvar_load_by_bus.items():
        if cols.get('mvar_col') and bus_num not in mw_load_by_bus:
            errors.append({
                "bus": str(bus_num),
                "error_type": ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED.value,
                "message": f"Bus {bus_num}: Has MVar column but missing MW column for #EV load"
            })
        elif cols.get('mvar_col') and not mw_load_by_bus.get(bus_num, {}).get('mw_col'):
            errors.append({
                "bus": str(bus_num),
                "error_type": ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED.value,
                "message": f"Bus {bus_num}: Has MVar column but missing MW column for #EV load"
            })

    return errors


def detect_reverse_power_flow(values: List[float], branch_name: str) -> Optional[Dict[str, Any]]:
    if branch_name != "1-2":
        return None

    min_mw = None
    has_reverse = False

    for value in values:
        if pd.notna(value) and value < 0:
            has_reverse = True
            if min_mw is None or value < min_mw:
                min_mw = value

    if has_reverse:
        return {
            "branch": branch_name,
            "min_mw": float(min_mw),
            "error_type": ValidationErrorType.REVERSE_POWER_FLOW.value,
            "message": f"Branch {branch_name}: Reverse power flow detected (min: {min_mw:.3f} MW)"
        }

    return None


def calculate_battery_cost(
    max_capacity: float,
    constraints: BatteryConstraints,
    battery_type: BatteryType
) -> Dict[str, Any]:
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
