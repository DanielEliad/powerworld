from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


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
    BATTERY_UNDERUTILIZED_ROUNDING = "battery_underutilized_rounding"
    VOLTAGE_VIOLATION = "voltage_violation"
    LOAD_ENERGY_NOT_CONSERVED = "load_energy_not_conserved"
    LOAD_PQ_NOT_SYNCHRONIZED = "load_pq_not_synchronized"
    REVERSE_POWER_FLOW = "reverse_power_flow"


class BatteryConstraints(BaseModel):
    cost_per_kwh: int
    min_size_kwh: int
    max_size_kwh: int
    rounding_increment_kwh: int
    allowed_bus_types: List[BusType]


class BusConfig(BaseModel):
    bus_number: int
    bus_type: BusType
    num_houses: int = 0
    num_solar_panels: int = 0
    ev_capacity_kw: float = 0.0


class PasteDataRequest(BaseModel):
    data: str


class LoadPasteRequest(BaseModel):
    data: str
    load_type: str


class UpdateBatteryRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    datetime: List[str]


class BusConfigurationRequest(BaseModel):
    buses: List[BusConfig]


class ReconstructTableRequest(BaseModel):
    battery_table_data: List[Dict[str, Any]]
    original_columns: List[str]
    original_data: List[Dict[str, Any]]


class AnalyzeRequest(BaseModel):
    lines_data: Optional[str] = None
    generators_data: Optional[str] = None
    buses_data: Optional[str] = None
    loads_mw_data: Optional[str] = None
    loads_mvar_data: Optional[str] = None


class LoadMoveOperation(BaseModel):
    bus_id: str
    from_index: int
    to_index: int
    mw_value: float


class MoveLoadsRequest(BaseModel):
    operations: List[LoadMoveOperation]
