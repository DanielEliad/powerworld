import { ApiEndpoint } from '../lib/constants'
import {
  AnalysisResult,
  LinesData,
  GeneratorsData,
  BusesData,
  LoadsData,
  BudgetSummary,
  BatteryCost,
  ValidationError,
  parseValidationError
} from '../types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export interface AnalyzeRequest {
  lines_data: string | null
  generators_data: string | null
  buses_data: string | null
  loads_mw_data: string | null
  loads_mvar_data: string | null
}

export interface UpdateBatteryRequest {
  battery_table_data: Record<string, any>[]
  datetime: string[]
}

export interface UpdateBatteryResponse {
  battery_capacity: Record<string, number[]>
  validation_errors: ValidationError[]
  battery_costs: Record<string, BatteryCost>
  budget_summary: BudgetSummary
}

export interface ReconstructTableRequest {
  battery_table_data: Record<string, any>[]
  original_columns: string[]
  original_data: Record<string, any>[]
}

export interface LoadMoveOperation {
  bus_id: string
  from_index: number
  to_index: number
  mw_value: number
}

export interface MoveLoadsRequest {
  operations: LoadMoveOperation[]
}

export interface MoveLoadsResponse {
  loads_mw_paste: string
  loads_mvar_paste: string | null
  current_mw_data: Record<string, number[]>
  original_mw_data: Record<string, number[]>
}

export async function analyze(request: AnalyzeRequest): Promise<AnalysisResult> {
  const response = await fetch(`${API_URL}${ApiEndpoint.ANALYZE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to analyze data')
  }

  const json = await response.json()

  const lines = json.lines ? LinesData.fromJSON(json.lines) : null
  const generators = json.generators ? GeneratorsData.fromJSON(json.generators) : null
  const buses = json.buses ? BusesData.fromJSON(json.buses) : null
  const loads = json.loads ? LoadsData.fromJSON(json.loads) : null
  const budget = json.budget_summary ? BudgetSummary.fromJSON(json.budget_summary) : null

  return new AnalysisResult(lines, generators, buses, loads, budget)
}

export async function updateBattery(request: UpdateBatteryRequest): Promise<UpdateBatteryResponse> {
  const response = await fetch(`${API_URL}${ApiEndpoint.UPDATE_BATTERY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error('Failed to update battery')
  }

  const json = await response.json()
  return {
    battery_capacity: json.battery_capacity,
    validation_errors: (json.validation_errors || []).map((e: any) => parseValidationError(e)),
    battery_costs: Object.fromEntries(
      Object.entries(json.battery_costs || {}).map(([k, v]) => [k, BatteryCost.fromJSON(v)])
    ),
    budget_summary: BudgetSummary.fromJSON(json.budget_summary)
  }
}

export async function reconstructTable(request: ReconstructTableRequest): Promise<string> {
  const response = await fetch(`${API_URL}${ApiEndpoint.RECONSTRUCT_TABLE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error('Failed to reconstruct table')
  }

  const result = await response.json()
  return result.data
}

export async function generateReport(reportData: any): Promise<Blob> {
  const response = await fetch(`${API_URL}${ApiEndpoint.GENERATE_REPORT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportData),
  })

  if (!response.ok) {
    throw new Error('Failed to generate report')
  }

  return response.blob()
}

export async function moveLoads(request: MoveLoadsRequest): Promise<MoveLoadsResponse> {
  const response = await fetch(`${API_URL}${ApiEndpoint.MOVE_LOADS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to move loads')
  }

  return response.json()
}

export async function resetLoads(): Promise<MoveLoadsResponse> {
  const response = await fetch(`${API_URL}${ApiEndpoint.RESET_LOADS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to reset loads')
  }

  return response.json()
}

export const api = {
  analyze,
  updateBattery,
  reconstructTable,
  generateReport,
  moveLoads,
  resetLoads
}
