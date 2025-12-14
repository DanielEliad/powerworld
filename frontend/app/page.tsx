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

interface LinesData {
  data: {
    datetime: string[]
    branches: BranchData
  }
  statistics: Statistics
  branch_names: string[]
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
  const linesTextareaRef = useRef<HTMLTextAreaElement>(null)
  const generatorsTextareaRef = useRef<HTMLTextAreaElement>(null)

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
        setAnalysisResult(prev => {
          if (!prev?.generators) return prev
          return {
            ...prev,
            generators: {
              ...prev.generators,
              battery_capacity: updated.battery_capacity
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

    return { max, min, avg, overLimit }
  }

  const overallStats = getOverallStats()

  const getPlotlyLayout = (title: string, yTitle: string, height: number = 400, isTimeSeries: boolean = false) => ({
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
    },
  })

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-100 mb-2">
            PowerWorld Simulation Analyzer
          </h1>
          <p className="text-gray-400">
            Paste tab-separated data from clipboard
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="border border-gray-700 rounded p-4 bg-gray-800/50">
            <p className="mb-2 text-gray-300 text-sm font-medium">Lines Data</p>
            <p className="mb-3 text-gray-400 text-xs">
              Paste tab-separated data from clipboard
            </p>
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
            <p className="mb-3 text-gray-400 text-xs">
              Paste tab-separated data from clipboard
            </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
              <div className="bg-gray-800 border border-gray-700 p-4 rounded">
                <h3 className="text-sm text-gray-400 mb-1">Branches Over 100%</h3>
                <div className="text-2xl font-medium text-gray-100">{overallStats.overLimit}</div>
              </div>
            </div>
          </div>
        )}

        {analysisResult?.lines && (
          <div className="mt-8 space-y-6">
            <div className="bg-gray-800 border border-gray-700 p-6 rounded">
              <h2 className="text-lg font-medium text-gray-200 mb-4">
                Branch Loading Over Time
              </h2>
              <div className="flex flex-wrap gap-2 mb-6">
                {analysisResult.lines.branch_names.map(branch => (
                  <label
                    key={branch}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded cursor-pointer hover:bg-gray-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBranches.has(branch)}
                      onChange={() => toggleBranch(branch)}
                      className="cursor-pointer"
                    />
                    <span className="text-sm text-gray-300">
                      {branch}
                    </span>
                  </label>
                ))}
              </div>
              <Plot
                data={getTimeSeriesTraces()}
                layout={{
                  ...getPlotlyLayout('Time', '% of MVA Limit', 500, true),
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
          </div>
        )}

        {analysisResult?.generators && (generatorData.length > 0 || (analysisResult.generators.data && analysisResult.generators.data.length > 0)) && (
          <div className="mt-8 space-y-6">
            <div className="bg-gray-800 border border-gray-700 p-6 rounded">
              <h2 className="text-lg font-medium text-gray-200 mb-4">
                Generator MW Output Over Time
              </h2>
              <Plot
                data={getGeneratorTraces()}
                layout={{
                  ...getPlotlyLayout('Time', 'MW Output', 500, true),
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

            {analysisResult.generators.battery_table && analysisResult.generators.battery_table.data.length > 0 && (
              <>
                {analysisResult.generators.battery_capacity && Object.keys(analysisResult.generators.battery_capacity).length > 0 && (
                  <div className="bg-gray-800 border border-gray-700 p-6 rounded">
                    <h2 className="text-lg font-medium text-gray-200 mb-4">
                      Battery Capacity by Bus
                    </h2>
                    <p className="text-sm text-gray-400 mb-4">
                      Capacity over time for each bus in kWh. Negative MW values charge the battery (capacity increases), positive values discharge (capacity decreases).
                    </p>
                    <Plot
                      data={getBatteryCapacityTraces()}
                      layout={{
                        ...getPlotlyLayout('Time', 'Capacity (kWh)', 500, true),
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

              <div className="bg-gray-800 border border-gray-700 p-6 rounded">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-200">
                    Battery Charging/Discharging (Editable)
                  </h2>
                  <button
                    onClick={exportBatteryToClipboard}
                    className="px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors text-sm"
                  >
                    Copy to Clipboard
                  </button>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Edit battery MW values. Negative values = charging, positive values = discharging.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {analysisResult.generators.battery_table.columns.map((col) => {
                          const isBatteryCol = col !== 'Date' && col !== 'Time'
                          const busNum = isBatteryCol ? analysisResult.generators.battery_table!.metadata[col] : null
                          return (
                            <th key={col} className="text-left p-2 text-sm font-medium text-gray-300 border-r border-gray-700 last:border-r-0">
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
                            return (
                              <td key={col} className="p-2 border-r border-gray-700 last:border-r-0">
                                {isBatteryCol ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={typeof row[col] === 'number' ? row[col] : parseFloat(String(row[col] ?? 0)) || 0}
                                      onChange={(e) => updateBatteryValue(rowIndex, col, e.target.value)}
                                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-100 text-sm focus:outline-none focus:border-gray-500"
                                      step="0.01"
                                      min="-999999"
                                      max="999999"
                                    />
                                    <div className="flex flex-col">
                                      <button
                                        type="button"
                                        onClick={() => incrementBatteryValue(rowIndex, col, 0.01)}
                                        className="px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs rounded-t border border-gray-600 border-b-0"
                                        title="Increase by 0.01"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => incrementBatteryValue(rowIndex, col, -0.01)}
                                        className="px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs rounded-b border border-gray-600"
                                        title="Decrease by 0.01"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">{String(row[col] ?? '')}</span>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
