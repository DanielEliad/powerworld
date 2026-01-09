'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { GeneratorsData } from '../../types'
import { getPlotlyLayout, CHART_COLORS, PLOTLY_CONFIG } from '../../lib/constants'

const Plot = dynamic(
  () => import('react-plotly.js').catch(() => {
    return { default: () => <div className="text-gray-400 p-4">Chart library loading...</div> }
  }),
  {
    ssr: false,
    loading: () => <div className="text-gray-400 p-4">Loading chart...</div>
  }
)

interface BatteryCapacityChartProps {
  generatorsData: GeneratorsData
}

export function BatteryCapacityChart({ generatorsData }: BatteryCapacityChartProps) {
  const batteryCapacity = generatorsData.battery_capacity
  const busNumbers = Object.keys(batteryCapacity).sort((a, b) => parseInt(a) - parseInt(b))

  const traces = useMemo(() => {
    let colorIndex = 0
    return busNumbers.map(bus => ({
      x: generatorsData.datetime,
      y: batteryCapacity[bus],
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: `Bus ${bus}`,
      line: { width: 2, color: CHART_COLORS[colorIndex++ % CHART_COLORS.length] },
    }))
  }, [generatorsData.datetime, batteryCapacity, busNumbers])

  if (busNumbers.length === 0) return null

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded">
      <h2 className="text-lg font-medium text-gray-200 mb-4">
        Battery Capacity by Bus
      </h2>
      <p className="text-sm text-gray-400 mb-4">
        Capacity over time for each bus in kWh. Negative MW values charge the battery (capacity increases), positive values discharge (capacity decreases).
      </p>
      <Plot
        data={traces}
        layout={getPlotlyLayout('Time', 'Capacity (kWh)', 600, true)}
        style={{ width: '100%', height: '100%' }}
        config={PLOTLY_CONFIG}
      />
    </div>
  )
}
