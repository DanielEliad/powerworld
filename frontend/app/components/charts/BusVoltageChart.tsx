'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { BusesData } from '../../types'
import { getPlotlyLayout, PLOTLY_CONFIG } from '../../lib/constants'

const Plot = dynamic(
  () => import('react-plotly.js').catch(() => {
    return { default: () => <div className="text-gray-400 p-4">Chart library loading...</div> }
  }),
  {
    ssr: false,
    loading: () => <div className="text-gray-400 p-4">Loading chart...</div>
  }
)

interface BusVoltageChartProps {
  busesData: BusesData
}

export function BusVoltageChart({ busesData }: BusVoltageChartProps) {
  const traces = useMemo(() => {
    return Object.entries(busesData.data.buses).map(([busNum, values]) => ({
      x: busesData.data.datetime,
      y: values,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: `Bus ${busNum}`,
      line: { width: 2 }
    }))
  }, [busesData.data.datetime, busesData.data.buses])

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded">
      <h2 className="text-lg font-medium text-gray-200 mb-4">
        Bus Voltage Over Time
      </h2>
      <p className="text-sm text-gray-400 mb-4">
        Per unit voltage at each bus. Values should stay between 0.9 and 1.1 p.u.
      </p>
      <Plot
        data={traces}
        layout={{
          ...getPlotlyLayout('Time', 'Voltage (p.u.)', 600, true),
          shapes: [
            {
              type: 'line',
              xref: 'paper',
              x0: 0,
              x1: 1,
              yref: 'y',
              y0: 0.9,
              y1: 0.9,
              line: {
                color: 'rgba(239, 68, 68, 0.6)',
                width: 2,
                dash: 'dash'
              }
            },
            {
              type: 'line',
              xref: 'paper',
              x0: 0,
              x1: 1,
              yref: 'y',
              y0: 1.1,
              y1: 1.1,
              line: {
                color: 'rgba(239, 68, 68, 0.6)',
                width: 2,
                dash: 'dash'
              }
            }
          ],
          annotations: [
            {
              xref: 'paper',
              x: 0.02,
              y: 0.9,
              text: 'Min 0.9 p.u.',
              showarrow: false,
              bgcolor: 'rgba(239, 68, 68, 0.8)',
              bordercolor: 'rgba(239, 68, 68, 0.8)',
              font: { color: '#ffffff', size: 10 },
            },
            {
              xref: 'paper',
              x: 0.02,
              y: 1.1,
              text: 'Max 1.1 p.u.',
              showarrow: false,
              bgcolor: 'rgba(239, 68, 68, 0.8)',
              bordercolor: 'rgba(239, 68, 68, 0.8)',
              font: { color: '#ffffff', size: 10 },
            }
          ]
        }}
        config={{ displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
