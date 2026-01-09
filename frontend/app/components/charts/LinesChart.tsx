'use client'

import dynamic from 'next/dynamic'
import { LinesData } from '../../types'
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

interface LinesChartProps {
  linesData: LinesData
  selectedBranches: Set<string>
  onToggleBranch: (branch: string) => void
}

export function LinesChart({ linesData, selectedBranches, onToggleBranch }: LinesChartProps) {
  const getTraces = () => {
    let colorIndex = 0
    return Array.from(selectedBranches)
      .filter(branch => linesData.data.branches[branch])
      .map(branch => ({
        x: linesData.data.datetime,
        y: linesData.data.branches[branch],
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: branch,
        line: { width: 2, color: CHART_COLORS[colorIndex++ % CHART_COLORS.length] },
      }))
  }

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded">
      <h2 className="text-lg font-medium text-gray-200 mb-4">
        Branch Loading Over Time
      </h2>
      <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
        {linesData.branch_names.map(branch => (
          <label
            key={branch}
            className="flex items-center gap-2 px-2 py-1 bg-gray-700 border border-gray-600 rounded cursor-pointer hover:bg-gray-600 transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedBranches.has(branch)}
              onChange={() => onToggleBranch(branch)}
              className="cursor-pointer"
            />
            <span className="text-xs text-gray-300">
              {branch}
            </span>
          </label>
        ))}
      </div>
      <Plot
        data={getTraces()}
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
              text: '90% threshold',
              showarrow: false,
              bgcolor: 'rgba(249, 115, 22, 0.8)',
              bordercolor: 'rgba(249, 115, 22, 0.8)',
              font: { color: '#ffffff', size: 10 },
            },
            {
              xref: 'paper',
              x: 0.02,
              y: 100,
              text: '100% limit',
              showarrow: false,
              bgcolor: 'rgba(239, 68, 68, 0.8)',
              bordercolor: 'rgba(239, 68, 68, 0.8)',
              font: { color: '#ffffff', size: 10 },
            },
          ],
        }}
        style={{ width: '100%', height: '100%' }}
        config={PLOTLY_CONFIG}
      />
    </div>
  )
}
