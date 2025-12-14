'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Load Plotly using a more reliable method that avoids chunk loading issues
const Plot = dynamic(
  () => import('react-plotly.js').catch(() => {
    // Fallback: return a placeholder component if import fails
    return { default: () => <div className="text-gray-400 p-4">Chart library loading...</div> }
  }),
  { 
    ssr: false,
    loading: () => <div className="text-gray-400 p-4">Loading chart...</div>
  }
)

interface BranchData {
  [key: string]: number[]
}

interface Statistics {
  [branch: string]: {
    max: number
    min: number
    avg: number
    current: number | null
  }
}

interface ReverseFlowError {
  branch: string
  min_mw: number
  error_type: string
  message: string
}

interface LinesData {
  data: {
    datetime: string[]
    branches: BranchData
  }
  statistics: Statistics
  branch_names: string[]
  main_line_below_90: boolean
  main_line_flatness: number | null
  mw_from_data?: {
    datetime: string[]
    branches: BranchData
  }
  mw_from_branch_names?: string[]
  reverse_flow_errors?: ReverseFlowError[]
  branches_with_reverse_flow_count?: number
}

interface BatteryCost {
  max_capacity_kwh: number
  rounded_capacity_kwh: number
  cost_per_kwh: number
  total_cost_eur: number
  battery_type: string
  min_size_kwh: number
  max_size_kwh: number
}

interface BudgetSummary {
  total_cost_eur: number
  budget_limit_eur: number
  percentage_used: number
  is_over_budget: boolean
}

interface GeneratorsData {
  columns: string[]
  rows: any[][]
  data: Record<string, any>[]
  datetime: string[]
  generators: { [key: string]: any[] }
  generator_columns: string[]
  battery_capacity?: { [bus: string]: number[] }
  battery_by_bus?: { [bus: string]: string[] }
  battery_table?: {
    columns: string[]
    data: Record<string, any>[]
    metadata: { [genName: string]: string }
  }
  battery_costs?: { [bus: string]: BatteryCost }
  budget_summary?: BudgetSummary
}

interface AnalysisResult {
  lines?: LinesData
  generators?: GeneratorsData
}

export default function Home() {
  const [linesPasteData, setLinesPasteData] = useState<string>('')
  const [generatorsPasteData, setGeneratorsPasteData] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())
  const [generatorData, setGeneratorData] = useState<Record<string, any>[]>([])
  const [showPastePanel, setShowPastePanel] = useState(true)
  const [batteryErrors, setBatteryErrors] = useState<Array<{
    bus: string;
    timestep: number;
    capacity: number;
    error_type?: string;
    min_size?: number;
    max_size?: number;
    power?: number;
    max_power_rating?: number;
    installed_capacity?: number;
    max_capacity?: number;
    percentage_remaining?: number;
    rounded_capacity?: number;
    wasted_capacity?: number;
    waste_percentage?: number;
    message?: string;
  }>>([])
  const [showErrorsExpanded, setShowErrorsExpanded] = useState(false)
  const [showBudgetExpanded, setShowBudgetExpanded] = useState(false)
  const linesTextareaRef = useRef<HTMLTextAreaElement>(null)
  const generatorsTextareaRef = useRef<HTMLTextAreaElement>(null)
  const pastePanelRef = useRef<HTMLDivElement>(null)
  const budgetPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pastePanelRef.current && !pastePanelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement
        if (!target.closest('button') || !target.textContent?.includes('Paste Areas')) {
          setShowPastePanel(false)
        }
      }
      if (budgetPanelRef.current && !budgetPanelRef.current.contains(event.target as Node)) {
        setShowBudgetExpanded(false)
      }
    }

    if (showPastePanel || showBudgetExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showPastePanel, showBudgetExpanded])

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const handleLinesPaste = async () => {
    if (!linesPasteData.trim()) {
      setError('Please paste lines data')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/analyze/lines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: linesPasteData }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process lines data')
      }

      const data = await response.json()
      setAnalysisResult(prev => ({ ...prev, lines: data }))
      setSelectedBranches(new Set(data.branch_names))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratorsPaste = async () => {
    if (!generatorsPasteData.trim()) {
      setError('Please paste generators data')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/analyze/generators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: generatorsPasteData }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to process generators data'
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorMessage
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Generators response:', data)
      
      if (!data || !data.data) {
        throw new Error('Invalid response format from server')
      }
      
      // Set validation errors from backend
      if (data.validation_errors) {
        setBatteryErrors(data.validation_errors)
      } else {
        setBatteryErrors([])
      }
      
      setAnalysisResult(prev => ({ ...prev, generators: data }))
      setGeneratorData([...data.data])
    } catch (err) {
      console.error('Error processing generators:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const toggleBranch = (branch: string) => {
    const newSelected = new Set(selectedBranches)
    if (newSelected.has(branch)) {
      newSelected.delete(branch)
    } else {
      newSelected.add(branch)
    }
    setSelectedBranches(newSelected)
  }

  const isCellInError = (rowIndex: number, col: string, busNum: string | null): boolean => {
    if (!busNum) return false
    // Check if this cell is in a row that causes a validation error
    // timestep in error corresponds to capacity array index
    // timestep 0 = initial capacity, timestep 1 = after row 0, timestep 2 = after row 1, etc.
    // So if error is at timestep N, the problematic row is N-1
    return batteryErrors.some(err => {
      if (err.bus !== busNum) return false
      // For constraint errors (above_max_size), timestep points to where max occurs
      // For negative capacity errors, timestep N means capacity went negative after processing row N-1
      if (err.error_type === "above_max_size") {
        // Highlight the row where max capacity occurs (timestep - 1)
        return err.timestep > 0 && rowIndex === err.timestep - 1
      } else {
        // For negative capacity, highlight row N-1
        return err.timestep > 0 && rowIndex === err.timestep - 1
      }
    })
  }

  const getHourFromTimestep = (timestep: number): string => {
    if (!analysisResult?.generators?.datetime) return `timestep ${timestep}`
    // timestep 0 = initial capacity (before any data), timestep 1 = after first row, etc.
    // datetime array has n+1 entries (including extra 00:00)
    // timestep 0 should show the first datetime, timestep 1 should show the second, etc.
    if (timestep < analysisResult.generators.datetime.length) {
      const dt = analysisResult.generators.datetime[timestep]
      try {
        const date = new Date(dt)
        const hours = date.getHours()
        const minutes = date.getMinutes()
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      } catch {
        return dt
      }
    }
    return `timestep ${timestep}`
  }

  const scrollToBatteryCell = (bus: string, timestep: number) => {
    // timestep N means capacity went negative after processing row N-1
    // So we need to scroll to row N-1 for the bus
    if (timestep > 0) {
      const rowIndex = timestep - 1
      const cellId = `battery-cell-${bus}-${rowIndex}`
      const cell = document.getElementById(cellId)
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Temporarily highlight the cell
        cell.classList.add('ring-2', 'ring-red-500', 'ring-opacity-75')
        setTimeout(() => {
          cell.classList.remove('ring-2', 'ring-red-500', 'ring-opacity-75')
        }, 2000)
        // Focus the input if it exists
        const input = cell.querySelector('input')
        if (input) {
          setTimeout(() => input.focus(), 300)
        }
      }
    }
  }

  const updateBatteryValue = async (rowIndex: number, genName: string, value: string) => {
    if (!analysisResult?.generators?.battery_table) return
    
    const numValue = parseFloat(value)
    const newValue = isNaN(numValue) ? 0 : numValue
    
   await updateBatteryValueInternal(rowIndex, genName, newValue)
  }

  const incrementBatteryValue = async (rowIndex: number, genName: string, delta: number) => {
    if (!analysisResult?.generators?.battery_table) return
    
    const currentValue = typeof analysisResult.generators.battery_table.data[rowIndex]?.[genName] === 'number' 
      ? analysisResult.generators.battery_table.data[rowIndex][genName] 
      : parseFloat(String(analysisResult.generators.battery_table.data[rowIndex]?.[genName] ?? 0)) || 0
    
    // Round to 2 decimal places to avoid floating point precision issues
    const newValue = Math.round((currentValue + delta) * 100) / 100
    await updateBatteryValueInternal(rowIndex, genName, newValue)
  }

  const updateBatteryValueInternal = async (rowIndex: number, genName: string, newValue: number) => {
    if (!analysisResult?.generators?.battery_table) return
    
    // Update local state immediately for UI responsiveness
    const newBatteryTableData = [...(analysisResult.generators.battery_table.data || [])]
    newBatteryTableData[rowIndex] = {
      ...newBatteryTableData[rowIndex],
      [genName]: newValue
    }
    
    setAnalysisResult(prev => {
      if (!prev?.generators?.battery_table) return prev
      return {
        ...prev,
        generators: {
          ...prev.generators,
          battery_table: {
            ...prev.generators.battery_table,
            data: newBatteryTableData
          }
        }
      }
    })
    
    // Recalculate capacity on backend
    try {
      const response = await fetch(`${API_URL}/api/analyze/generators/update-battery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          battery_table_data: newBatteryTableData,
          datetime: analysisResult.generators.datetime
        }),
      })
      
      if (response.ok) {
        const updated = await response.json()
        
        // Set validation errors from backend
        if (updated.validation_errors) {
          setBatteryErrors(updated.validation_errors)
        } else {
          setBatteryErrors([])
        }
        
        setAnalysisResult(prev => {
          if (!prev?.generators) return prev
          return {
            ...prev,
            generators: {
              ...prev.generators,
              battery_capacity: updated.battery_capacity,
              battery_costs: updated.battery_costs,
              budget_summary: updated.budget_summary
            }
          }
        })
      }
    } catch (err) {
      console.error('Error updating battery capacity:', err)
    }
  }

  const exportBatteryToClipboard = async () => {
    if (!analysisResult?.generators?.battery_table || !analysisResult.generators.columns || !analysisResult.generators.data) return

    try {
      // Send battery table data to backend to reconstruct full table
      const response = await fetch(`${API_URL}/api/analyze/generators/reconstruct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          battery_table_data: analysisResult.generators.battery_table.data,
          original_columns: analysisResult.generators.columns,
          original_data: analysisResult.generators.data
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to reconstruct table')
      }

      const result = await response.json()
      await navigator.clipboard.writeText(result.data)
    } catch (err) {
      console.error('Error exporting battery data:', err)
    }
  }

  const getTimeSeriesTraces = () => {
    if (!analysisResult?.lines) return []

    const colors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#4ade80', '#22d3ee']
    let colorIndex = 0

    return Array.from(selectedBranches)
      .filter(branch => analysisResult.lines!.data.branches[branch])
      .map(branch => ({
        x: analysisResult.lines!.data.datetime,
        y: analysisResult.lines!.data.branches[branch],
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: branch,
        line: { width: 2, color: colors[colorIndex++ % colors.length] },
      }))
  }

  const getGeneratorTraces = () => {
    if (!analysisResult?.generators || !analysisResult.generators.datetime) return []
    
    // Use generatorData if available, otherwise use data from analysisResult
    const dataToUse = generatorData.length > 0 ? generatorData : (analysisResult.generators.data || [])
    if (dataToUse.length === 0) return []

    const genColumns = analysisResult.generators.generator_columns || []
    if (genColumns.length === 0) return []

    const colors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#4ade80', '#22d3ee']
    let colorIndex = 0
    
    return genColumns.map(col => {
      const values = dataToUse.map(row => {
        const val = row[col]
        return typeof val === 'number' ? val : parseFloat(String(val)) || 0
      })
      
      return {
        x: analysisResult.generators!.datetime,
        y: values,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: col,
        line: { width: 2, color: colors[colorIndex++ % colors.length] },
      }
    })
  }

  const getBatteryCapacityTraces = () => {
    if (!analysisResult?.generators || !analysisResult.generators.datetime || !analysisResult.generators.battery_capacity) return []

    const batteryCapacity = analysisResult.generators.battery_capacity
    const busNumbers = Object.keys(batteryCapacity).sort((a, b) => parseInt(a) - parseInt(b))
    
    if (busNumbers.length === 0) return []

    const colors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#4ade80', '#22d3ee', '#f59e0b', '#10b981']
    let colorIndex = 0

    return busNumbers.map(bus => ({
      x: analysisResult.generators!.datetime,
      y: batteryCapacity[bus],
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: `Bus ${bus}`,
      line: { width: 2, color: colors[colorIndex++ % colors.length] },
    }))
  }

  const getOverallStats = () => {
    if (!analysisResult?.lines) return null

    const stats = Object.values(analysisResult.lines.statistics)
    const max = Math.max(...stats.map(s => s.max))
    const min = Math.min(...stats.map(s => s.min))
    const avg = stats.reduce((sum, s) => sum + s.avg, 0) / stats.length
    const overLimit = stats.filter(s => s.max > 100).length

    // Get main line metrics from backend
    const mainLineBelow90 = analysisResult.lines.main_line_below_90
    const mainLineFlatness = analysisResult.lines.main_line_flatness
    const reverseFlowCount = analysisResult.lines.branches_with_reverse_flow_count || 0

    return { max, min, avg, overLimit, mainLineBelow90, mainLineFlatness, reverseFlowCount }
  }

  const overallStats = getOverallStats()


  const getPlotlyLayout = (title: string, yTitle: string, height: number = 600, isTimeSeries: boolean = false) => ({
    title: '',
    font: { color: '#e5e7eb' },
    paper_bgcolor: '#1f2937',
    plot_bgcolor: '#111827',
    xaxis: {
      title,
      gridcolor: '#374151',
      linecolor: '#4b5563',
      titlefont: { color: '#9ca3af' },
      ...(isTimeSeries ? {
        type: 'date',
        tickformat: '%H:%M',
        dtick: 3600000,
        tickmode: 'linear',
      } : {}),
    },
    yaxis: {
      title: yTitle,
      gridcolor: '#374151',
      linecolor: '#4b5563',
      titlefont: { color: '#9ca3af' },
    },
    height,
    hovermode: 'closest' as const,
    showlegend: true,
    legend: {
      bgcolor: '#1f2937',
      bordercolor: '#374151',
      font: { color: '#e5e7eb' },
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
      yanchor: 'top',
    },
    margin: {
      l: 60,
      r: 60,
      t: 40,
      b: 100,
    },
  })

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Fixed Navbar */}
      <nav className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {analysisResult?.generators?.budget_summary ? (
              <div className="relative" ref={budgetPanelRef}>
                <div 
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => setShowBudgetExpanded(!showBudgetExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 text-xs font-medium">Budget:</span>
                    <span className={`text-xs font-semibold ${
                      analysisResult.generators.budget_summary.is_over_budget 
                        ? 'text-red-400' 
                        : analysisResult.generators.budget_summary.percentage_used > 90 
                          ? 'text-yellow-400' 
                          : 'text-green-400'
                    }`}>
                      {analysisResult.generators.budget_summary.total_cost_eur.toLocaleString('en-US', { maximumFractionDigits: 0 })} €
                    </span>
                    <span className="text-gray-400 text-xs">/</span>
                    <span className="text-gray-300 text-xs">{analysisResult.generators.budget_summary.budget_limit_eur.toLocaleString('en-US')} €</span>
                    <div className="w-16 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          analysisResult.generators.budget_summary.is_over_budget 
                            ? 'bg-red-500' 
                            : analysisResult.generators.budget_summary.percentage_used > 90 
                              ? 'bg-yellow-500' 
                              : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(analysisResult.generators.budget_summary.percentage_used, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-[10px]">
                      {showBudgetExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>
                {showBudgetExpanded && analysisResult?.generators?.battery_costs && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                    <div className="p-4">
                      <div className="text-gray-200 font-semibold text-sm mb-3">Battery Installation Details:</div>
                      <div className="space-y-3">
                        {Object.entries(analysisResult.generators.battery_costs).map(([busNum, cost]) => (
                          <div key={busNum} className="bg-gray-700/50 border border-gray-600 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-gray-200 font-medium">Bus {busNum}</span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                cost.battery_type === 'Home Battery' 
                                  ? 'bg-blue-900/50 text-blue-300 border border-blue-600' 
                                  : 'bg-purple-900/50 text-purple-300 border border-purple-600'
                              }`}>
                                {cost.battery_type}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between text-gray-400">
                                <span>Max Capacity:</span>
                                <span className="text-gray-300">{cost.max_capacity_kwh.toFixed(2)} kWh</span>
                              </div>
                              <div className="flex justify-between text-gray-400">
                                <span>Rounded Capacity:</span>
                                <span className="text-gray-300">{cost.rounded_capacity_kwh.toFixed(0)} kWh</span>
                              </div>
                              <div className="flex justify-between text-gray-400">
                                <span>Cost per kWh:</span>
                                <span className="text-gray-300">{cost.cost_per_kwh.toLocaleString('en-US')} €/kWh</span>
                              </div>
                              <div className="flex justify-between text-gray-400">
                                <span>Size Range:</span>
                                <span className="text-gray-300">{cost.min_size_kwh} - {cost.max_size_kwh} kWh</span>
                              </div>
                              <div className="flex justify-between font-semibold text-gray-200 pt-1 border-t border-gray-600 mt-1">
                                <span>Total Cost:</span>
                                <span className="text-green-400">{cost.total_cost_eur.toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-600 border border-gray-500 rounded px-3 py-2 opacity-60 cursor-not-allowed">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">Budget: Please upload generator data</span>
                </div>
              </div>
            )}
            {(() => {
              const errors = batteryErrors.filter(e => 
                e.error_type !== 'battery_not_fully_used' && 
                e.error_type !== 'battery_underutilized_rounding'
              )
              const warnings = batteryErrors.filter(e => 
                e.error_type === 'battery_not_fully_used' || 
                e.error_type === 'battery_underutilized_rounding'
              )
              // Include reverse flow errors from lines data
              const reverseFlowErrors = analysisResult?.lines?.reverse_flow_errors || []
              const hasErrors = errors.length > 0 || reverseFlowErrors.length > 0
              const hasWarnings = warnings.length > 0
              
              // Don't render if no errors or warnings
              if (!hasErrors && !hasWarnings) return null
              
              return (
                <div className="flex-1 relative">
                  <div 
                    className={`border rounded px-3 py-2 cursor-pointer transition-colors ${
                      hasErrors 
                        ? 'bg-red-900/30 border-red-600 hover:bg-red-900/40' 
                        : 'bg-yellow-900/30 border-yellow-600 hover:bg-yellow-900/40'
                    }`}
                    onClick={() => setShowErrorsExpanded(!showErrorsExpanded)}
                  >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${hasErrors ? 'text-red-400' : 'text-yellow-400'}`}>
                            {hasErrors ? '⚠️' : '⚡'} {hasErrors ? (errors.length + reverseFlowErrors.length) : warnings.length} {hasErrors ? 'Validation Error' : 'Warning'}{(hasErrors ? (errors.length + reverseFlowErrors.length) : warnings.length) !== 1 ? 's' : ''}
                          </span>
                        {!showErrorsExpanded && (
                          <span className={`text-xs ${hasErrors ? 'text-red-300' : 'text-yellow-300'}`}>
                            {hasErrors 
                              ? `Click to view all errors`
                              : `Click to view all warnings`
                            }
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${hasErrors ? 'text-red-400' : 'text-yellow-400'}`}>
                        {showErrorsExpanded ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>
                  {showErrorsExpanded && (
                    <div className={`absolute top-full left-0 right-0 mt-1 bg-gray-800 border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto ${hasErrors ? 'border-red-600' : 'border-yellow-600'}`}>
                      <div className="p-3">
                        {hasErrors && (
                          <>
                            <div className="text-red-400 font-semibold text-sm mb-2">Validation Errors:</div>
                            <div className="space-y-1 mb-3">
                              {errors.map((err, idx) => {
                                let errorMessage = `Bus ${err.bus} - ${getHourFromTimestep(err.timestep)}: Capacity = ${err.capacity.toFixed(2)} kWh`
                                if (err.error_type === "negative_capacity") {
                                  errorMessage += " (must be ≥ 0)"
                                } else if (err.error_type === "above_max_size" && err.max_size !== undefined) {
                                  errorMessage += ` (exceeds max ${err.max_size} kWh)`
                                } else if (err.error_type === "exceeds_power_rating" && err.power !== undefined && err.max_power_rating !== undefined) {
                                  errorMessage = `Bus ${err.bus} - ls${getHourFromTimestep(err.timestep)}: Power ${Math.abs(err.power).toFixed(3)} MW exceeds rating ${err.max_power_rating.toFixed(3)} MW`
                                } else if (err.message) {
                                  errorMessage = err.message
                                }
                                return (
                                  <div 
                                    key={idx} 
                                    onClick={() => scrollToBatteryCell(err.bus, err.timestep)}
                                    className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded cursor-pointer hover:bg-red-900/40 transition-colors"
                                  >
                                    {errorMessage}
                                  </div>
                                )
                              })}
                              {reverseFlowErrors.map((err, idx) => (
                                <div 
                                  key={`reverse-${idx}`}
                                  className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded"
                                >
                                  ⚡ {err.message}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {hasWarnings && (warnings.length > 0 || reverseFlowWarnings.length > 0) && (
                          <>
                            <div className={`font-semibold text-sm mb-2 ${hasErrors ? 'mt-3 text-yellow-400' : 'text-yellow-400'}`}>
                              Warnings:
                            </div>
                            <div className="space-y-1">
                              {warnings.map((warn, idx) => (
                                <div 
                                  key={`warn-${idx}`}
                                  className="text-yellow-300 text-xs py-1 px-2 bg-yellow-900/20 rounded"
                                >
                                  {warn.message}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            <div className="flex items-center gap-2 ml-auto">
              {analysisResult?.generators?.battery_table && analysisResult.generators.battery_table.data.length > 0 && (
                <button
                  onClick={exportBatteryToClipboard}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
                  title="Copy battery data to clipboard"
                >
                  Copy Battery Data
                </button>
              )}
              <div className="relative" ref={pastePanelRef}>
                <button
                  onClick={() => setShowPastePanel(!showPastePanel)}
                  className="px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  {showPastePanel ? '▼ Hide' : '▲ Show'} Paste Areas
                </button>
                
                {/* Dropdown Paste Panel */}
                {showPastePanel && (
                  <div className="absolute right-0 top-full mt-2 w-[600px] max-w-[90vw] bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    <div className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-gray-700 rounded p-4 bg-gray-800/50">
                          <p className="mb-2 text-gray-300 text-sm font-medium">Lines Data</p>
                          <textarea
                            ref={linesTextareaRef}
                            value={linesPasteData}
                            onChange={(e) => setLinesPasteData(e.target.value)}
                            onPaste={(e) => {
                              e.preventDefault()
                              const pasted = e.clipboardData.getData('text')
                              setLinesPasteData(pasted)
                            }}
                            placeholder="Paste lines data here (Date, Time, Skip, branch columns...)"
                            className="w-full h-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 text-xs font-mono focus:outline-none focus:border-gray-500 resize-none"
                          />
                          <button
                            onClick={handleLinesPaste}
                            disabled={loading}
                            className="mt-3 w-full px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loading ? 'Processing...' : 'Process Lines Data'}
                          </button>
                        </div>

                        <div className="border border-gray-700 rounded p-4 bg-gray-800/50">
                          <p className="mb-2 text-gray-300 text-sm font-medium">Generators Data</p>
                          <textarea
                            ref={generatorsTextareaRef}
                            value={generatorsPasteData}
                            onChange={(e) => setGeneratorsPasteData(e.target.value)}
                            onPaste={(e) => {
                              e.preventDefault()
                              const pasted = e.clipboardData.getData('text')
                              setGeneratorsPasteData(pasted)
                            }}
                            placeholder="Paste generators data here (Date, Time, Gen columns...)"
                            className="w-full h-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 text-xs font-mono focus:outline-none focus:border-gray-500 resize-none"
                          />
                          <button
                            onClick={handleGeneratorsPaste}
                            disabled={loading}
                            className="mt-3 w-full px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loading ? 'Processing...' : 'Process Generators Data'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="w-full px-4 md:px-6 py-4">

        {error && (
          <div className="mt-6 bg-red-900/20 border-l-4 border-red-500 text-red-300 p-4 rounded">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-gray-400"></div>
            <p className="mt-4 text-gray-400">Processing data...</p>
          </div>
        )}

        {overallStats && (
          <div className="mt-8">
            <h2 className="text-xl font-medium text-gray-200 mb-4">Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h3 className="text-sm text-gray-400 mb-1">Maximum Loading</h3>
                <div className="text-2xl font-medium text-gray-100">{overallStats.max.toFixed(2)}%</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h3 className="text-sm text-gray-400 mb-1">Minimum Loading</h3>
                <div className="text-2xl font-medium text-gray-100">{overallStats.min.toFixed(2)}%</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h3 className="text-sm text-gray-400 mb-1">Average Loading</h3>
                <div className="text-2xl font-medium text-gray-100">{overallStats.avg.toFixed(2)}%</div>
              </div>
              <div className={`bg-gray-800 border p-4 rounded ${overallStats.overLimit === 0 ? 'border-green-600' : 'border-gray-700'}`}>
                <h3 className="text-sm text-gray-400 mb-1">Branches Over 100%</h3>
                <div className={`text-2xl font-medium ${overallStats.overLimit === 0 ? 'text-green-400' : 'text-gray-100'}`}>{overallStats.overLimit}</div>
              </div>
              <div className={`bg-gray-800 border p-4 rounded ${overallStats.mainLineBelow90 ? 'border-green-600' : 'border-yellow-600'}`}>
                <h3 className="text-sm text-gray-400 mb-1">Main Line (1→2) Below 90%</h3>
                <div className={`text-2xl font-medium ${overallStats.mainLineBelow90 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {overallStats.mainLineBelow90 ? '✓ Yes' : '✗ No'}
                </div>
              </div>
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h3 className="text-sm text-gray-400 mb-1">Main Line (1→2) Flatness</h3>
                <div className="text-2xl font-medium text-gray-100">
                  {overallStats.mainLineFlatness != null ? `${overallStats.mainLineFlatness.toFixed(2)}%` : 'N/A'}
                </div>
                <p className="text-xs text-gray-500 mt-1">Lower is flatter</p>
              </div>
              {analysisResult?.lines?.mw_from_data && (
                <div className={`bg-gray-800 border p-4 rounded ${overallStats.reverseFlowCount === 0 ? 'border-green-600' : 'border-yellow-600'}`}>
                  <h3 className="text-sm text-gray-400 mb-1">Branches w/ Reverse Flow</h3>
                  <div className={`text-2xl font-medium ${overallStats.reverseFlowCount === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {overallStats.reverseFlowCount}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Negative power flow</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full-width charts */}
        <div className="mt-8 space-y-6">
          {analysisResult?.lines && (
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-lg font-medium text-gray-200 mb-4">
                Branch Loading Over Time
              </h2>
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {analysisResult.lines.branch_names.map(branch => (
                  <label
                    key={branch}
                    className="flex items-center gap-2 px-2 py-1 bg-gray-700 border border-gray-600 rounded cursor-pointer hover:bg-gray-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBranches.has(branch)}
                      onChange={() => toggleBranch(branch)}
                      className="cursor-pointer"
                    />
                    <span className="text-xs text-gray-300">
                      {branch}
                    </span>
                  </label>
                ))}
              </div>
              <Plot
                data={getTimeSeriesTraces()}
                layout={{
                  ...getPlotlyLayout('Time', '% of MVA Limit', 600, true),
                  shapes: [
                    {
                      type: 'line',
                      xref: 'paper',
                      x0: 0,
                      x1: 1,
                      yref: 'y',
                      y0: 90,
                      y1: 90,
                      line: { color: '#f97316', width: 2, dash: 'dash' },
                    },
                    {
                      type: 'line',
                      xref: 'paper',
                      x0: 0,
                      x1: 1,
                      yref: 'y',
                      y0: 100,
                      y1: 100,
                      line: { color: '#ef4444', width: 2, dash: 'dash' },
                    },
                  ],
                  annotations: [
                    {
                      xref: 'paper',
                      x: 0.02,
                      y: 90,
                      text: '90% Limit',
                      showarrow: false,
                      bgcolor: 'rgba(249,115,22,0.1)',
                      bordercolor: '#f97316',
                      font: { color: '#f97316' },
                    },
                    {
                      xref: 'paper',
                      x: 0.02,
                      y: 100,
                      text: '100% Limit',
                      showarrow: false,
                      bgcolor: 'rgba(239,68,68,0.1)',
                      bordercolor: '#ef4444',
                      font: { color: '#ef4444' },
                    },
                  ],
                }}
                style={{ width: '100%', height: '100%' }}
                config={{ 
                  responsive: true,
                  displayModeBar: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                }}
              />
            </div>
          )}

          {/* MW From Branches (Reverse Power Flow Detection) */}
          {analysisResult?.lines?.mw_from_data && analysisResult.lines.mw_from_branch_names && analysisResult.lines.mw_from_branch_names.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-lg font-medium text-gray-200 mb-4">
                Branch Power Flow (MW From)
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Negative values indicate reverse power flow (power flowing opposite to expected direction)
              </p>
              <Plot
                data={analysisResult.lines.mw_from_branch_names.map(branch => ({
                  x: analysisResult.lines!.mw_from_data!.datetime,
                  y: analysisResult.lines!.mw_from_data!.branches[branch],
                  type: 'scatter',
                  mode: 'lines',
                  name: branch,
                  line: { width: 2 }
                }))}
                layout={{
                  ...getPlotlyLayout('Time', 'Power (MW)', 600, true),
                  shapes: [
                    {
                      type: 'line',
                      xref: 'paper',
                      x0: 0,
                      x1: 1,
                      yref: 'y',
                      y0: 0,
                      y1: 0,
                      line: {
                        color: 'rgba(156, 163, 175, 0.8)',
                        width: 2,
                        dash: 'dot'
                      }
                    }
                  ],
                  annotations: [
                    {
                      xref: 'paper',
                      x: 0.02,
                      y: 0,
                      text: 'Zero Line',
                      showarrow: false,
                      bgcolor: 'rgba(75, 85, 99, 0.8)',
                      bordercolor: 'rgba(156, 163, 175, 0.8)',
                      font: { color: '#9ca3af', size: 10 },
                    }
                  ]
                }}
                config={{ displayModeBar: false }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          )}

          {analysisResult?.generators?.battery_capacity && Object.keys(analysisResult.generators.battery_capacity).length > 0 && (
            <div className="bg-gray-800 border border-gray-700 p-4 rounded">
              <h2 className="text-lg font-medium text-gray-200 mb-4">
                Battery Capacity by Bus
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Capacity over time for each bus in kWh. Negative MW values charge the battery (capacity increases), positive values discharge (capacity decreases).
              </p>
              <Plot
                data={getBatteryCapacityTraces()}
                layout={{
                  ...getPlotlyLayout('Time', 'Capacity (kWh)', 600, true),
                }}
                style={{ width: '100%', height: '100%' }}
                config={{ 
                  responsive: true,
                  displayModeBar: true,
                  displaylogo: false,
                  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                }}
              />
            </div>
          )}
        </div>

        {analysisResult?.generators && (generatorData.length > 0 || (analysisResult.generators.data && analysisResult.generators.data.length > 0)) && (
          <div className="mt-8 space-y-6">
            {analysisResult.generators.battery_table && analysisResult.generators.battery_table.data.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h2 className="text-base font-medium text-gray-200 mb-2">
                  Battery Charging/Discharging (Editable)
                </h2>
                <p className="text-xs text-gray-400 mb-3">
                  Edit battery MW values. Negative = charging, positive = discharging.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {analysisResult.generators.battery_table.columns.map((col) => {
                          const isBatteryCol = col !== 'Date' && col !== 'Time'
                          const busNum = isBatteryCol ? analysisResult.generators.battery_table!.metadata[col] : null
                          return (
                            <th key={col} className="text-left px-1 py-1 text-xs font-medium text-gray-300 border-r border-gray-700 last:border-r-0">
                              {col === 'Date' ? 'Date' : col === 'Time' ? 'Time' : `Bus ${busNum}`}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.generators.battery_table.data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-700 hover:bg-gray-700/50">
                          {analysisResult.generators.battery_table!.columns.map((col) => {
                            const isBatteryCol = col !== 'Date' && col !== 'Time'
                            const busNum = isBatteryCol ? analysisResult.generators.battery_table!.metadata[col] : null
                            const hasError = isBatteryCol && isCellInError(rowIndex, col, busNum)
                            const cellId = isBatteryCol && busNum ? `battery-cell-${busNum}-${rowIndex}` : undefined
                            return (
                              <td 
                                key={col} 
                                id={cellId}
                                className={`px-1 py-0.5 border-r border-gray-700 last:border-r-0 ${hasError ? 'bg-red-900/30' : ''}`}
                              >
                                {isBatteryCol ? (
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      value={typeof row[col] === 'number' ? row[col] : parseFloat(String(row[col] ?? 0)) || 0}
                                      onChange={(e) => updateBatteryValue(rowIndex, col, e.target.value)}
                                      className={`w-16 rounded px-1 py-0.5 text-xs focus:outline-none ${
                                        hasError 
                                          ? 'bg-red-900/50 border border-red-600 text-red-100' 
                                          : 'bg-gray-700 border border-gray-600 text-gray-100 focus:border-gray-500'
                                      }`}
                                      step="0.01"
                                      min="-999999"
                                      max="999999"
                                    />
                                    <div className="flex flex-col">
                                      <button
                                        type="button"
                                        onClick={() => incrementBatteryValue(rowIndex, col, 0.01)}
                                        className="px-0.5 py-0 bg-gray-600 hover:bg-gray-500 text-gray-200 text-[10px] leading-tight rounded-t border border-gray-600 border-b-0"
                                        title="Increase by 0.01"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => incrementBatteryValue(rowIndex, col, -0.01)}
                                        className="px-0.5 py-0 bg-gray-600 hover:bg-gray-500 text-gray-200 text-[10px] leading-tight rounded-b border border-gray-600"
                                        title="Decrease by 0.01"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs whitespace-nowrap">{String(row[col] ?? '')}</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
