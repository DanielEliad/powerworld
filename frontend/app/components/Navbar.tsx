'use client'

import { useState, useRef } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { AnalysisResult, ValidationError, ValidationErrorType } from '../types'
import { getHourFromTimestep } from '../lib/utils'

interface NavbarProps {
  analysisResult: AnalysisResult
  batteryErrors: ValidationError[]
  onGenerateReport: () => void
  onClearData: () => void
  onScrollToBatteryCell: (bus: string, timestep: number) => void
  showPastePanel: boolean
  onTogglePastePanel: () => void
  hasData: boolean
  hasBatteryData: boolean
}

export function Navbar({
  analysisResult,
  batteryErrors,
  onGenerateReport,
  onClearData,
  onScrollToBatteryCell,
  showPastePanel,
  onTogglePastePanel,
  hasData,
  hasBatteryData
}: NavbarProps) {
  const [showBudgetExpanded, setShowBudgetExpanded] = useState(false)
  const [showErrorsExpanded, setShowErrorsExpanded] = useState(false)
  const budgetPanelRef = useRef<HTMLDivElement>(null)

  useClickOutside(budgetPanelRef, () => setShowBudgetExpanded(false), showBudgetExpanded)

  const errors = batteryErrors.filter(e =>
    e.type !== ValidationErrorType.BATTERY_NOT_FULLY_USED &&
    e.type !== ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING
  )
  const warnings = batteryErrors.filter(e =>
    e.type === ValidationErrorType.BATTERY_NOT_FULLY_USED ||
    e.type === ValidationErrorType.BATTERY_UNDERUTILIZED_ROUNDING
  )
  const reverseFlowErrors = analysisResult.lines?.reverse_flow_errors || []
  const voltageErrors = analysisResult.buses?.voltage_errors || []
  const loadErrors = analysisResult.loads?.validation_errors || []
  const hasErrors = errors.length > 0 || reverseFlowErrors.length > 0 || voltageErrors.length > 0 || loadErrors.length > 0
  const hasWarnings = warnings.length > 0

  return (
    <>
      {/* Budget Panel */}
          {analysisResult.budget_summary ? (
            <div className="relative" ref={budgetPanelRef}>
              <div
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 cursor-pointer hover:bg-gray-600 transition-colors"
                onClick={() => setShowBudgetExpanded(!showBudgetExpanded)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-300 text-xs font-medium">Budget:</span>
                  <span className={`text-xs font-semibold ${
                    analysisResult.budget_summary.is_over_budget
                      ? 'text-red-400'
                      : analysisResult.budget_summary.percentage_used > 90
                        ? 'text-yellow-400'
                        : 'text-green-400'
                  }`}>
                    {analysisResult.budget_summary.total_cost_eur.toLocaleString('en-US', { maximumFractionDigits: 0 })} €
                  </span>
                  <span className="text-gray-400 text-xs">/</span>
                  <span className="text-gray-300 text-xs">{analysisResult.budget_summary.budget_limit_eur.toLocaleString('en-US')} €</span>
                  <div className="w-16 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        analysisResult.budget_summary.is_over_budget
                          ? 'bg-red-500'
                          : analysisResult.budget_summary.percentage_used > 90
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(analysisResult.budget_summary.percentage_used, 100)}%` }}
                    />
                  </div>
                  <span className="text-gray-400 text-[10px]">
                    {showBudgetExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {showBudgetExpanded && analysisResult.generators && (
                <BudgetExpandedPanel
                  analysisResult={analysisResult}
                />
              )}
            </div>
          ) : (
            <div className="bg-gray-600 border border-gray-500 rounded px-3 py-2 opacity-60 cursor-not-allowed">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">Budget: Please upload generator data</span>
              </div>
            </div>
          )}

          {/* Errors/Warnings Panel */}
          {(hasErrors || hasWarnings) && (
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
                      {hasErrors ? '⚠️' : '⚡'} {hasErrors ? (errors.length + reverseFlowErrors.length + voltageErrors.length + loadErrors.length) : warnings.length} {hasErrors ? 'Validation Error' : 'Warning'}{(hasErrors ? (errors.length + reverseFlowErrors.length + voltageErrors.length + loadErrors.length) : warnings.length) !== 1 ? 's' : ''}
                    </span>
                    {!showErrorsExpanded && (
                      <span className={`text-xs ${hasErrors ? 'text-red-300' : 'text-yellow-300'}`}>
                        {hasErrors
                          ? 'Click to view all errors'
                          : 'Click to view all warnings'
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
                <ErrorsExpandedPanel
                  errors={errors}
                  warnings={warnings}
                  reverseFlowErrors={reverseFlowErrors}
                  voltageErrors={voltageErrors}
                  loadErrors={loadErrors}
                  hasErrors={hasErrors}
                  hasWarnings={hasWarnings}
                  onScrollToBatteryCell={onScrollToBatteryCell}
                />
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {analysisResult && (analysisResult.lines || analysisResult.generators) && (
              <button
                onClick={onGenerateReport}
                className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                title="Generate PDF Report"
              >
                Generate Report
              </button>
            )}
            {hasData && (
              <button
                onClick={onClearData}
                className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                title="Clear all saved data"
              >
                Clear Data
              </button>
            )}
            <button
              onClick={onTogglePastePanel}
              className="px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              {showPastePanel ? '▼ Hide' : '▲ Show'} Paste Areas
            </button>
          </div>
    </>
  )
}

function BudgetExpandedPanel({ analysisResult }: { analysisResult: AnalysisResult }) {
  if (!analysisResult.generators) return null

  return (
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

        {analysisResult.loads && analysisResult.loads.load_cost_eur > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-600">
            <div className="text-gray-200 font-semibold text-sm mb-3">Load Movement Costs:</div>
            <div className="bg-gray-700/50 border border-gray-600 rounded p-3">
              <div className="space-y-1 text-xs">
                {Object.entries(analysisResult.loads.energy_moved_kwh).map(([busNum, kwh]) => (
                  <div key={busNum} className="flex justify-between text-gray-400">
                    <span>Bus {busNum} (Energy moved: {kwh.toFixed(2)} kWh):</span>
                    <span className="text-gray-300">{(kwh * 500).toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-gray-200 pt-1 border-t border-gray-600 mt-1">
                  <span>Total Load Cost:</span>
                  <span className="text-green-400">{analysisResult.loads.load_cost_eur.toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {analysisResult.budget_summary?.battery_cost_eur !== undefined && (
          <div className="mt-4 pt-4 border-t border-gray-600">
            <div className="text-gray-200 font-semibold text-sm mb-2">Budget Breakdown:</div>
            <div className="bg-gray-700/50 border border-gray-600 rounded p-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Battery Costs:</span>
                  <span className="text-gray-300">{analysisResult.budget_summary?.battery_cost_eur?.toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                </div>
                {analysisResult.budget_summary?.load_cost_eur !== undefined && analysisResult.budget_summary.load_cost_eur > 0 && (
                  <div className="flex justify-between text-gray-400">
                    <span>Load Movement Costs:</span>
                    <span className="text-gray-300">{analysisResult.budget_summary?.load_cost_eur?.toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-gray-200 pt-1 border-t border-gray-600 mt-1">
                  <span>Total Cost:</span>
                  <span className="text-green-400">{analysisResult.budget_summary.total_cost_eur.toLocaleString('en-US', { maximumFractionDigits: 0 })} €</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ErrorsExpandedPanelProps {
  errors: ValidationError[]
  warnings: ValidationError[]
  reverseFlowErrors: ValidationError[]
  voltageErrors: ValidationError[]
  loadErrors: ValidationError[]
  hasErrors: boolean
  hasWarnings: boolean
  onScrollToBatteryCell: (bus: string, timestep: number) => void
}

function ErrorsExpandedPanel({
  errors,
  warnings,
  reverseFlowErrors,
  voltageErrors,
  loadErrors,
  hasErrors,
  hasWarnings,
  onScrollToBatteryCell
}: ErrorsExpandedPanelProps) {
  return (
    <div className={`absolute top-full left-0 right-0 mt-1 bg-gray-800 border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto ${hasErrors ? 'border-red-600' : 'border-yellow-600'}`}>
      <div className="p-3">
        {hasErrors && (
          <>
            <div className="text-red-400 font-semibold text-sm mb-2">Validation Errors:</div>
            <div className="space-y-1 mb-3">
              {errors.map((err, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if ('timestep' in err) {
                      onScrollToBatteryCell(err.element, err.timestep)
                    }
                  }}
                  className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded cursor-pointer hover:bg-red-900/40 transition-colors"
                >
                  {err.message}
                </div>
              ))}
              {reverseFlowErrors.map((err, idx) => (
                <div
                  key={`reverse-${idx}`}
                  className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded"
                >
                  {err.message}
                </div>
              ))}
              {voltageErrors.map((err, idx) => (
                <div
                  key={`voltage-${idx}`}
                  className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded"
                >
                  {err.message}
                </div>
              ))}
              {loadErrors.map((err, idx) => (
                <div
                  key={`load-${idx}`}
                  className="text-red-300 text-xs py-1 px-2 bg-red-900/20 rounded"
                >
                  {err.message}
                </div>
              ))}
            </div>
          </>
        )}
        {hasWarnings && warnings.length > 0 && (
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
  )
}
