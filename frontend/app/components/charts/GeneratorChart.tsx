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

interface GeneratorChartProps {
  generatorsData: GeneratorsData
}

export function GeneratorChart({ generatorsData }: GeneratorChartProps) {
  const traces = useMemo(() => {
    const genColumns = generatorsData.generator_columns || []
    if (genColumns.length === 0) return []

    let colorIndex = 0
    return genColumns.map(col => {
      const values = generatorsData.data.map(row => {
        const val = row[col]
        return typeof val === 'number' ? val : parseFloat(String(val)) || 0
      })

      return {
        x: generatorsData.datetime,
        y: values,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: col,
        line: { width: 2, color: CHART_COLORS[colorIndex++ % CHART_COLORS.length] },
      }
    })
  }, [generatorsData.datetime, generatorsData.data, generatorsData.generator_columns])

  if (generatorsData.data.length === 0) return null

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded">
      <h2 className="text-lg font-medium text-gray-200 mb-4">
        Generator Output Over Time
      </h2>
      <Plot
        data={traces}
        layout={getPlotlyLayout('Time', 'MW', 600, true)}
        style={{ width: '100%', height: '100%' }}
        config={PLOTLY_CONFIG}
      />
    </div>
  )
}
