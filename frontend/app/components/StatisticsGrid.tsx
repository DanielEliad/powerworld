'use client'

import { AnalysisResult } from '../types'

export interface OverallStats {
  max: number
  min: number
  avg: number
  overLimit: number
  mainLineBelow90: boolean
  mainLineFlatness: number | null
  mainTransformerReverseFlow: boolean | null
}

interface StatisticsGridProps {
  stats: OverallStats
  analysisResult: AnalysisResult
}

export function StatisticsGrid({ stats, analysisResult }: StatisticsGridProps) {
  return (
    <div className="mt-8">
      <h2 className="text-xl font-medium text-gray-200 mb-4">Statistics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Maximum Loading"
          value={`${stats.max.toFixed(2)}%`}
        />
        <StatCard
          title="Minimum Loading"
          value={`${stats.min.toFixed(2)}%`}
        />
        <StatCard
          title="Average Loading"
          value={`${stats.avg.toFixed(2)}%`}
        />
        <StatCard
          title="Branches Over 100%"
          value={String(stats.overLimit)}
          highlight={stats.overLimit === 0 ? 'success' : undefined}
        />
        <StatCard
          title="Main Line (1→2) Below 90%"
          value={stats.mainLineBelow90 ? '✓ Yes' : '✗ No'}
          highlight={stats.mainLineBelow90 ? 'success' : 'warning'}
        />
        <StatCard
          title="Main Line (1→2) Flatness"
          value={stats.mainLineFlatness != null ? `${stats.mainLineFlatness.toFixed(2)}%` : 'N/A'}
          subtitle="Lower is flatter"
        />
        {analysisResult.lines && stats.mainTransformerReverseFlow !== null && (
          <StatCard
            title="Main transformer reverse flow"
            value={stats.mainTransformerReverseFlow ? 'Yes' : 'No'}
            highlight={stats.mainTransformerReverseFlow ? 'warning' : 'success'}
            subtitle="Based on 1→2 MW From branch"
          />
        )}
        {analysisResult.buses && (
          <StatCard
            title="Buses w/ Voltage Violations"
            value={String(analysisResult.buses.buses_with_violations_count)}
            highlight={analysisResult.buses.buses_with_violations_count === 0 ? 'success' : 'error'}
            subtitle="Outside 0.9-1.1 p.u."
          />
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  highlight?: 'success' | 'warning' | 'error'
}

function StatCard({ title, value, subtitle, highlight }: StatCardProps) {
  const borderColor = highlight === 'success'
    ? 'border-green-600'
    : highlight === 'warning'
      ? 'border-yellow-600'
      : highlight === 'error'
        ? 'border-red-600'
        : 'border-gray-700'

  const valueColor = highlight === 'success'
    ? 'text-green-400'
    : highlight === 'warning'
      ? 'text-yellow-400'
      : highlight === 'error'
        ? 'text-red-400'
        : 'text-gray-100'

  return (
    <div className={`bg-gray-800 border p-4 rounded ${borderColor}`}>
      <h3 className="text-sm text-gray-400 mb-1">{title}</h3>
      <div className={`text-2xl font-medium ${valueColor}`}>{value}</div>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

export function getOverallStats(analysisResult: AnalysisResult): OverallStats | null {
  if (!analysisResult.lines) return null

  const stats = Object.values(analysisResult.lines.statistics)
  const max = Math.max(...stats.map(s => s.max))
  const min = Math.min(...stats.map(s => s.min))
  const avg = stats.reduce((sum, s) => sum + s.avg, 0) / stats.length
  const overLimit = stats.filter(s => s.max > 100).length

  return {
    max,
    min,
    avg,
    overLimit,
    mainLineBelow90: analysisResult.lines.main_line_below_90,
    mainLineFlatness: analysisResult.lines.main_line_flatness,
    mainTransformerReverseFlow: analysisResult.lines.main_transformer_reverse_flow
  }
}
