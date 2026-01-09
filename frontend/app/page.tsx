'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAnalysisData } from './hooks/useAnalysisData'
import { useClickOutside } from './hooks/useClickOutside'
import { api } from './hooks/useApi'
import { LocalStorageKey } from './lib/constants'
import { AnalysisResult, ValidationErrorType } from './types'
import {
  Navbar,
  PastePanel,
  StatisticsGrid,
  getOverallStats,
  BatteryTable,
  scrollToBatteryCell,
  EVLoadScheduler,
  LinesChart,
  GeneratorChart,
  BatteryCapacityChart,
  BusVoltageChart
} from './components'

export default function Home() {
  const {
    pasteData,
    setPasteData,
    loading,
    error,
    analysisResult,
    updateBatteryValue,
    exportBatteryToClipboard,
    applyLoadMoves,
    resetLoadMoves,
    exportLoadMWToClipboard,
    exportLoadMVarToClipboard,
    recomputeAll
  } = useAnalysisData()

  const [deselectedBranches, setDeselectedBranches] = useState<Set<string>>(new Set())
  const [showPastePanel, setShowPastePanel] = useState(true)
  const pastePanelRef = useRef<HTMLDivElement>(null)

  useClickOutside(pastePanelRef, () => setShowPastePanel(false), showPastePanel)

  // Compute selected branches from available branches minus deselected ones
  const selectedBranches = useMemo(() => {
    if (!analysisResult.lines) return new Set<string>()
    return new Set(analysisResult.lines.branch_names.filter(b => !deselectedBranches.has(b)))
  }, [analysisResult.lines, deselectedBranches])

  const toggleBranch = useCallback((branch: string) => {
    setDeselectedBranches(prev => {
      const newSet = new Set(prev)
      if (newSet.has(branch)) {
        newSet.delete(branch)
      } else {
        newSet.add(branch)
      }
      return newSet
    })
  }, [])

  const handleClearData = () => {
    if (confirm('Clear all saved data? This will remove all charts and paste data.')) {
      localStorage.removeItem(LocalStorageKey.LINES_DATA)
      localStorage.removeItem(LocalStorageKey.GENERATORS_DATA)
      localStorage.removeItem(LocalStorageKey.BUSES_DATA)
      localStorage.removeItem(LocalStorageKey.LOADS_MW_DATA)
      localStorage.removeItem(LocalStorageKey.LOADS_MVAR_DATA)
      window.location.reload()
    }
  }

  const handleGenerateReport = async () => {
    if (!analysisResult) return

    try {
      const batteryErrors = analysisResult.generators?.validation_errors || []
      const errors = batteryErrors.filter(e =>
        e.type !== ValidationErrorType.BATTERY_NOT_FULLY_USED &&
        e.type !== ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING
      )
      const warnings = batteryErrors.filter(e =>
        e.type === ValidationErrorType.BATTERY_NOT_FULLY_USED ||
        e.type === ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING
      )

      const overallStats = getOverallStats(analysisResult)

      const reportData = {
        budget_summary: analysisResult.budget_summary,
        battery_costs: analysisResult.generators?.battery_costs || null,
        errors,
        warnings,
        reverse_flow_errors: analysisResult.lines?.reverse_flow_errors || [],
        voltage_errors: analysisResult.buses?.voltage_errors || [],
        statistics: overallStats,
        lines_data: analysisResult.lines?.data || null,
        battery_capacity: analysisResult.generators?.battery_capacity || null,
        battery_table: analysisResult.generators?.battery_table || null,
        buses_data: analysisResult.buses?.data || null,
        buses_with_violations_count: analysisResult.buses?.buses_with_violations_count || 0
      }

      const blob = await api.generateReport(reportData)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `powerworld_report_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error generating report:', err)
      alert('Failed to generate report')
    }
  }

  const hasData = !!(pasteData.lines || pasteData.generators || pasteData.buses || pasteData.loadsMW || pasteData.loadsMVar)
  const hasBatteryData = !!(analysisResult.generators?.battery_table?.data?.length)
  const batteryErrors = analysisResult.generators?.validation_errors || []
  const overallStats = getOverallStats(analysisResult)

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navbar with paste panel trigger */}
      <nav ref={pastePanelRef} className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Navbar
              analysisResult={analysisResult}
              batteryErrors={batteryErrors}
              onGenerateReport={handleGenerateReport}
              onClearData={handleClearData}
              onScrollToBatteryCell={scrollToBatteryCell}
              showPastePanel={showPastePanel}
              onTogglePastePanel={() => setShowPastePanel(!showPastePanel)}
              hasData={hasData}
              hasBatteryData={hasBatteryData}
            />
          </div>

          {/* Paste Panel Dropdown */}
          {showPastePanel && (
            <div className="relative">
              <PastePanel
                pasteData={pasteData}
                onPasteDataChange={setPasteData}
                onRefresh={recomputeAll}
                loading={loading}
              />
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="w-full px-4 md:px-6 py-4">
        {/* Error Display */}
        {error && (
          <div className="mt-6 bg-red-900/20 border-l-4 border-red-500 text-red-300 p-4 rounded">
            {error}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="mt-6 text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-gray-400"></div>
            <p className="mt-4 text-gray-400">Processing data...</p>
          </div>
        )}

        {/* Statistics Grid */}
        {overallStats && (
          <StatisticsGrid stats={overallStats} analysisResult={analysisResult} />
        )}

        {/* Charts Section */}
        <div className="mt-8 space-y-6">
          {analysisResult.lines && (
            <LinesChart
              linesData={analysisResult.lines}
              selectedBranches={selectedBranches}
              onToggleBranch={toggleBranch}
            />
          )}

          {analysisResult.generators && analysisResult.generators.data.length > 0 && (
            <GeneratorChart generatorsData={analysisResult.generators} />
          )}

          {analysisResult.buses && (
            <BusVoltageChart busesData={analysisResult.buses} />
          )}

          {analysisResult.generators && Object.keys(analysisResult.generators.battery_capacity).length > 0 && (
            <BatteryCapacityChart generatorsData={analysisResult.generators} />
          )}
        </div>

        {/* EV Load Scheduler */}
        {analysisResult.loads && !analysisResult.loads.is_first_paste && Object.keys(analysisResult.loads.load_by_bus).length > 0 && (
          <EVLoadScheduler
            loadsData={analysisResult.loads}
            onApplyMoves={applyLoadMoves}
            onReset={resetLoadMoves}
            onExportMW={exportLoadMWToClipboard}
            onExportMVar={exportLoadMVarToClipboard}
          />
        )}

        {/* Battery Table */}
        {analysisResult.generators && hasBatteryData && (
          <div className="mt-8">
            <BatteryTable
              generatorsData={analysisResult.generators}
              batteryErrors={batteryErrors}
              onUpdateValue={updateBatteryValue}
              onExportBattery={exportBatteryToClipboard}
            />
          </div>
        )}
      </div>
    </div>
  )
}
