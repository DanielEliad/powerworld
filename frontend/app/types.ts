export enum ValidationErrorType {
  ABOVE_MAX_SIZE = 'above_max_size',
  NEGATIVE_CAPACITY = 'negative_capacity',
  EXCEEDS_POWER_RATING = 'exceeds_power_rating',
  BATTERY_UNDERUTILIZED_ROUNDING = 'battery_underutilized_rounding',
  BATTERY_NOT_FULLY_USED = 'battery_not_fully_used',
  REVERSE_POWER_FLOW = 'reverse_power_flow',
  VOLTAGE_VIOLATION = 'voltage_violation',
  LOAD_ENERGY_NOT_CONSERVED = 'load_energy_not_conserved',
  LOAD_PQ_NOT_SYNCHRONIZED = 'load_pq_not_synchronized'
}

type BatteryCapacityTooLargeError = {
  type: ValidationErrorType.ABOVE_MAX_SIZE
  element: string
  message: string
  timestep: number
  capacity: number
  min_size: number
  max_size: number
}

type BatteryCapacityNegativeError = {
  type: ValidationErrorType.NEGATIVE_CAPACITY
  element: string
  message: string
  timestep: number
  capacity: number
}

type BatteryPowerExceededError = {
  type: ValidationErrorType.EXCEEDS_POWER_RATING
  element: string
  message: string
  timestep: number
  power: number
  max_power_rating: number
}

type BatteryRoundingWarning = {
  type: ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING
  element: string
  message: string
  rounded_capacity: number
  wasted_capacity: number
  waste_percentage: number
}

type BatteryNotFullyUsedWarning = {
  type: ValidationErrorType.BATTERY_NOT_FULLY_USED
  element: string
  message: string
  installed_capacity?: number
  max_capacity: number
  percentage_remaining: number
}

type ReverseFlowError = {
  type: ValidationErrorType.REVERSE_POWER_FLOW
  element: string
  message: string
  min_mw: number
}

type VoltageViolationError = {
  type: ValidationErrorType.VOLTAGE_VIOLATION
  element: string
  message: string
  timestep: number
  voltage: number
}

type LoadEnergyNotConservedError = {
  type: ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED
  element: string
  message: string
}

type LoadPQNotSynchronizedError = {
  type: ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED
  element: string
  message: string
}

export type ValidationError = 
  | BatteryCapacityTooLargeError 
  | BatteryCapacityNegativeError
  | BatteryPowerExceededError 
  | BatteryRoundingWarning 
  | BatteryNotFullyUsedWarning 
  | ReverseFlowError 
  | VoltageViolationError
  | LoadEnergyNotConservedError
  | LoadPQNotSynchronizedError

export function parseValidationError(json: any): ValidationError {
  const errorType = json.error_type || json.type
  const element = json.bus || json.branch || json.element

  switch (errorType) {
    case ValidationErrorType.ABOVE_MAX_SIZE:
      return {
        type: ValidationErrorType.ABOVE_MAX_SIZE,
        element,
        message: json.message || `Battery capacity exceeds maximum`,
        timestep: json.timestep,
        capacity: json.capacity,
        min_size: json.min_size,
        max_size: json.max_size
      }
    case ValidationErrorType.NEGATIVE_CAPACITY:
      return {
        type: ValidationErrorType.NEGATIVE_CAPACITY,
        element,
        message: json.message || `Battery capacity is negative`,
        timestep: json.timestep,
        capacity: json.capacity
      }
    case ValidationErrorType.EXCEEDS_POWER_RATING:
      return {
        type: ValidationErrorType.EXCEEDS_POWER_RATING,
        element,
        message: json.message || `Power exceeds rating`,
        timestep: json.timestep,
        power: json.power,
        max_power_rating: json.max_power_rating
      }
    case ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING:
      return {
        type: ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING,
        element,
        message: json.message || `Battery underutilized due to rounding`,
        rounded_capacity: json.rounded_capacity,
        wasted_capacity: json.wasted_capacity,
        waste_percentage: json.waste_percentage
      }
    case ValidationErrorType.BATTERY_NOT_FULLY_USED:
      return {
        type: ValidationErrorType.BATTERY_NOT_FULLY_USED,
        element,
        message: json.message || `Battery not fully discharged`,
        installed_capacity: json.installed_capacity,
        max_capacity: json.max_capacity,
        percentage_remaining: json.percentage_remaining
      }
    case ValidationErrorType.REVERSE_POWER_FLOW:
      return {
        type: ValidationErrorType.REVERSE_POWER_FLOW,
        element,
        message: json.message || `Reverse power flow detected`,
        min_mw: json.min_mw
      }
    case ValidationErrorType.VOLTAGE_VIOLATION:
      return {
        type: ValidationErrorType.VOLTAGE_VIOLATION,
        element,
        message: json.message || `Voltage out of range`,
        timestep: json.timestep,
        voltage: json.voltage
      }
    case ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED:
      return {
        type: ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED,
        element,
        message: json.message || `Load energy not conserved`
      }
    case ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED:
      return {
        type: ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED,
        element,
        message: json.message || `Load P/Q not synchronized`
      }
    default:
      throw new Error(`Unknown error type: ${errorType}`)
  }
}

export class BatteryCost {
  constructor(
    public max_capacity_kwh: number,
    public rounded_capacity_kwh: number,
    public cost_per_kwh: number,
    public total_cost_eur: number,
    public battery_type: string,
    public min_size_kwh: number,
    public max_size_kwh: number
  ) {}

  static fromJSON(json: any): BatteryCost {
    return new BatteryCost(
      json.max_capacity_kwh,
      json.rounded_capacity_kwh,
      json.cost_per_kwh,
      json.total_cost_eur,
      json.battery_type,
      json.min_size_kwh,
      json.max_size_kwh
    )
  }
}

export class BudgetSummary {
  constructor(
    public total_cost_eur: number,
    public budget_limit_eur: number,
    public percentage_used: number,
    public is_over_budget: boolean,
    public battery_cost_eur?: number,
    public load_cost_eur?: number
  ) {}

  static fromJSON(json: any): BudgetSummary {
    return new BudgetSummary(
      json.total_cost_eur,
      json.budget_limit_eur,
      json.percentage_used,
      json.is_over_budget,
      json.battery_cost_eur,
      json.load_cost_eur
    )
  }
}

export class BatteryTable {
  constructor(
    public columns: string[],
    public data: Record<string, any>[],
    public metadata: Record<string, string>
  ) {}

  static fromJSON(json: any): BatteryTable {
    return new BatteryTable(json.columns, json.data, json.metadata)
  }
}

export class LinesData {
  constructor(
    public data: { datetime: string[]; branches: Record<string, number[]> },
    public statistics: Record<string, { max: number; min: number; avg: number; current: number | null }>,
    public branch_names: string[],
    public main_line_below_90: boolean,
    public main_line_flatness: number | null,
    public mw_from_data: { datetime: string[]; branches: Record<string, number[]> },
    public mw_from_branch_names: string[],
    public reverse_flow_errors: ValidationError[],
    public main_transformer_reverse_flow: boolean
  ) {}

  static fromJSON(json: any): LinesData {
    return new LinesData(
      json.data,
      json.statistics,
      json.branch_names,
      json.main_line_below_90,
      json.main_line_flatness,
      json.mw_from_data,
      json.mw_from_branch_names,
      (json.reverse_flow_errors || []).map((e: any) => parseValidationError(e)),
      json.main_transformer_reverse_flow || false
    )
  }
}

export class BusesData {
  constructor(
    public data: { datetime: string[]; buses: Record<string, number[]> },
    public bus_numbers: string[],
    public voltage_errors: ValidationError[],
    public buses_with_violations_count: number,
    public statistics: Record<string, { min: number; max: number; avg: number }>
  ) {}

  static fromJSON(json: any): BusesData {
    return new BusesData(
      json.data,
      json.bus_numbers,
      (json.voltage_errors || []).map((e: any) => parseValidationError(e)),
      json.buses_with_violations_count || 0,
      json.statistics || {}
    )
  }
}

export class GeneratorsData {
  constructor(
    public columns: string[],
    public rows: any[][],
    public data: Record<string, any>[],
    public datetime: string[],
    public generators: Record<string, any[]>,
    public generator_columns: string[],
    public battery_capacity: Record<string, number[]>,
    public battery_by_bus: Record<string, string[]>,
    public battery_table: BatteryTable,
    public validation_errors: ValidationError[],
    public battery_costs: Record<string, BatteryCost>
  ) {}

  static fromJSON(json: any): GeneratorsData {
    return new GeneratorsData(
      json.columns,
      json.rows,
      json.data,
      json.datetime,
      json.generators,
      json.generator_columns,
      json.battery_capacity || {},
      json.battery_by_bus || {},
      BatteryTable.fromJSON(json.battery_table || { columns: [], data: [], metadata: {} }),
      (json.validation_errors || []).map((e: any) => parseValidationError(e)),
      Object.fromEntries(
        Object.entries(json.battery_costs || {}).map(([k, v]) => [k, BatteryCost.fromJSON(v)])
      )
    )
  }
}

export class LoadsData {
  constructor(
    public columns: string[],
    public rows: any[][],
    public data: Record<string, any>[],
    public datetime: string[],
    public load_columns: string[],
    public load_by_bus: Record<string, { mw_col: string; mvar_col: string }>,
    public mw_data: Record<string, number[]>,
    public mvar_data: Record<string, number[]>,
    public original_mw_data: Record<string, number[]>,
    public differences: Record<string, { mw: number[]; mvar: number[] }>,
    public energy_moved_kwh: Record<string, number>,
    public load_cost_eur: number,
    public validation_errors: ValidationError[],
    public is_first_paste: boolean
  ) {}

  static fromJSON(json: any): LoadsData {
    return new LoadsData(
      json.columns,
      json.rows,
      json.data,
      json.datetime,
      json.load_columns || [],
      json.load_by_bus || {},
      json.mw_data || {},
      json.mvar_data || {},
      json.original_mw_data || json.mw_data || {},  // Fallback to mw_data for first paste
      json.differences || {},
      json.energy_moved_kwh || {},
      json.load_cost_eur || 0,
      (json.validation_errors || []).map((e: any) => parseValidationError(e)),
      json.is_first_paste || false
    )
  }
}

export class AnalysisResult {
  constructor(
    public lines: LinesData | null,
    public generators: GeneratorsData | null,
    public buses: BusesData | null,
    public loads: LoadsData | null,
    public budget_summary: BudgetSummary | null
  ) {}

  static empty(): AnalysisResult {
    return new AnalysisResult(null, null, null, null, null)
  }

  withLines(lines: LinesData): AnalysisResult {
    return new AnalysisResult(lines, this.generators, this.buses, this.loads, this.budget_summary)
  }

  withGenerators(generators: GeneratorsData): AnalysisResult {
    return new AnalysisResult(this.lines, generators, this.buses, this.loads, this.budget_summary)
  }

  withBuses(buses: BusesData): AnalysisResult {
    return new AnalysisResult(this.lines, this.generators, buses, this.loads, this.budget_summary)
  }

  withLoads(loads: LoadsData): AnalysisResult {
    return new AnalysisResult(this.lines, this.generators, this.buses, loads, this.budget_summary)
  }

  withBudgetSummary(budget: BudgetSummary | null): AnalysisResult {
    return new AnalysisResult(this.lines, this.generators, this.buses, this.loads, budget)
  }

  hasData(): boolean {
    return this.lines !== null || this.generators !== null || this.buses !== null || this.loads !== null
  }
}
