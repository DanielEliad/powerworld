'use client'

import React from 'react'
import { GeneratorsData, ValidationError, ValidationErrorType } from '../types'
import { round } from '../lib/utils'

interface BatteryTableProps {
  generatorsData: GeneratorsData
  batteryErrors: ValidationError[]
  onUpdateValue: (rowIndex: number, genName: string, value: number) => void
  onExportBattery: () => Promise<boolean>
}

export function BatteryTable({
  generatorsData,
  batteryErrors,
  onUpdateValue,
  onExportBattery
}: BatteryTableProps) {
  const { battery_table } = generatorsData
  const [showCopyPopup, setShowCopyPopup] = React.useState(false)

  if (!battery_table || battery_table.data.length === 0) return null

  const isCellInError = (rowIndex: number, col: string, busNum: string | null): boolean => {
    if (!busNum) return false
    return batteryErrors.some(err => {
      if (err.element !== busNum) return false
      if (!('timestep' in err)) return false
      return err.timestep > 0 && rowIndex === err.timestep - 1
    })
  }

  const handleInputChange = (rowIndex: number, col: string, value: string) => {
    const numValue = parseFloat(value)
    const newValue = isNaN(numValue) ? 0 : numValue
    onUpdateValue(rowIndex, col, newValue)
  }

  const handleIncrement = (rowIndex: number, col: string, delta: number) => {
    const currentValue = typeof battery_table.data[rowIndex][col] === 'number'
      ? battery_table.data[rowIndex][col]
      : parseFloat(String(battery_table.data[rowIndex][col] || 0)) || 0
    const newValue = round(currentValue + delta)
    onUpdateValue(rowIndex, col, newValue)
  }

  const handleExport = async () => {
    const success = await onExportBattery()
    if (success) {
      setShowCopyPopup(true)
      setTimeout(() => setShowCopyPopup(false), 3000)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded relative">
      {/* Copy Success Popup */}
      {showCopyPopup && (
        <div className="absolute top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-10 animate-fade-in flex items-center gap-2">
          <span className="text-lg">✓</span>
          <span className="font-medium">Battery data copied!</span>
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-base font-medium text-gray-200">
            Battery Charging/Discharging (Editable)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Edit battery MW values. Negative = charging, positive = discharging.
            <span className="text-yellow-400 font-semibold ml-2">1C Rate Limit:</span> Power must not exceed battery capacity (e.g., 100 kWh battery → max 0.1 MW)
          </p>
        </div>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          title="Copy battery data to paste into PowerWorld"
        >
          Export Battery
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              {battery_table.columns.map((col) => {
                const isBatteryCol = col !== 'Date' && col !== 'Time'
                const busNum = isBatteryCol ? battery_table.metadata[col] : null
                return (
                  <th key={col} className="text-left px-1 py-1 text-xs font-medium text-gray-300 border-r border-gray-700 last:border-r-0">
                    {col === 'Date' ? 'Date' : col === 'Time' ? 'Time' : `Bus ${busNum}`}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {battery_table.data.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-700 hover:bg-gray-700/50">
                {battery_table.columns.map((col) => {
                  const isBatteryCol = col !== 'Date' && col !== 'Time'
                  const busNum = isBatteryCol ? battery_table.metadata[col] : null
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
                            onChange={(e) => handleInputChange(rowIndex, col, e.target.value)}
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
                              onClick={() => handleIncrement(rowIndex, col, 0.01)}
                              className="px-0.5 py-0 bg-gray-600 hover:bg-gray-500 text-gray-200 text-[10px] leading-tight rounded-t border border-gray-600 border-b-0"
                              title="Increase by 0.01"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIncrement(rowIndex, col, -0.01)}
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
  )
}

export function scrollToBatteryCell(bus: string, timestep: number) {
  if (timestep > 0) {
    const rowIndex = timestep - 1
    const cellId = `battery-cell-${bus}-${rowIndex}`
    const cell = document.getElementById(cellId)
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' })
      cell.classList.add('ring-2', 'ring-red-500', 'ring-opacity-75')
      setTimeout(() => {
        cell.classList.remove('ring-2', 'ring-red-500', 'ring-opacity-75')
      }, 2000)
      const input = cell.querySelector('input')
      if (input) {
        setTimeout(() => input.focus(), 300)
      }
    }
  }
}
