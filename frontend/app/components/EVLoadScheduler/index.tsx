'use client'

import { useState, useEffect } from 'react'
import { LoadsData, ValidationError, ValidationErrorType } from '../../types'
import { Timeline } from './Timeline'

interface LoadMoveOperation {
  bus_id: string
  from_index: number
  to_index: number
  mw_value: number
}

interface EVLoadSchedulerProps {
  loadsData: LoadsData
  onApplyMoves: (operations: LoadMoveOperation[]) => Promise<{ mw: string; mvar: string | null; current_mw_data?: Record<string, number[]>; original_mw_data?: Record<string, number[]> } | null>
  onReset: () => Promise<{ mw: string; mvar: string | null; current_mw_data?: Record<string, number[]>; original_mw_data?: Record<string, number[]> } | null>
  onExportMW: () => Promise<boolean>
  onExportMVar: () => Promise<boolean>
}

export function EVLoadScheduler({
  loadsData,
  onApplyMoves,
  onReset,
  onExportMW,
  onExportMVar
}: EVLoadSchedulerProps) {
  const evBusIds = Object.keys(loadsData.load_by_bus || {}).sort((a, b) => Number(a) - Number(b))
  const [selectedBus, setSelectedBus] = useState<string | null>(evBusIds[0] || null)
  const [currentMW, setCurrentMW] = useState<Record<string, number[]>>({})
  const [applying, setApplying] = useState(false)
  const [showCopyPopup, setShowCopyPopup] = useState<'mw' | 'mvar' | null>(null)

  useEffect(() => {
    if (evBusIds.length > 0 && (!selectedBus || !evBusIds.includes(selectedBus))) {
      setSelectedBus(evBusIds[0])
    }
  }, [evBusIds, selectedBus])

  // Initialize current MW from loadsData
  useEffect(() => {
    setCurrentMW(loadsData.mw_data)
  }, [loadsData.mw_data])

  if (!selectedBus || evBusIds.length === 0) return null

  const busInfo = loadsData.load_by_bus[selectedBus]
  if (!busInfo) return null

  const currentBusMW = currentMW[selectedBus] || loadsData.mw_data[selectedBus] || []
  const originalBusMW = loadsData.original_mw_data[selectedBus] || loadsData.mw_data[selectedBus] || []
  const datetime = loadsData.datetime || []

  const busErrors = loadsData.validation_errors.filter(
    err => err.element === selectedBus && (
      err.type === ValidationErrorType.LOAD_ENERGY_NOT_CONSERVED ||
      err.type === ValidationErrorType.LOAD_PQ_NOT_SYNCHRONIZED
    )
  )

  const handleMoveBlock = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= datetime.length || toIdx >= datetime.length) {
      return
    }

    const mwValue = currentBusMW[fromIdx]
    if (Math.abs(mwValue) < 0.001) {
      return
    }

    // Update local state optimistically
    const newMW = [...currentBusMW]
    newMW[fromIdx] = newMW[fromIdx] - mwValue
    newMW[toIdx] = newMW[toIdx] + mwValue
    setCurrentMW({ ...currentMW, [selectedBus]: newMW })

    // Apply the move immediately to backend
    setApplying(true)
    try {
      const result = await onApplyMoves([{
        bus_id: selectedBus,
        from_index: fromIdx,
        to_index: toIdx,
        mw_value: mwValue
      }])

      if (result && result.current_mw_data) {
        // Update with backend response (original will come from loadsData after recompute)
        setCurrentMW(result.current_mw_data)
      }
    } catch (err) {
      console.error('Error applying move:', err)
      // Revert optimistic update on error
      setCurrentMW({ ...currentMW, [selectedBus]: currentBusMW })
    } finally {
      setApplying(false)
    }
  }

  const handleExportMW = async () => {
    const success = await onExportMW()
    if (success) {
      setShowCopyPopup('mw')
      setTimeout(() => setShowCopyPopup(null), 3000)
    }
  }

  const handleExportMVar = async () => {
    const success = await onExportMVar()
    if (success) {
      setShowCopyPopup('mvar')
      setTimeout(() => setShowCopyPopup(null), 3000)
    }
  }

  const handleReset = async () => {
    setApplying(true)
    try {
      const result = await onReset()
      if (result && result.current_mw_data) {
        setCurrentMW(result.current_mw_data)
      }
    } catch (err) {
      console.error('Error resetting:', err)
    } finally {
      setApplying(false)
    }
  }

  // Check if there are any modifications
  const hasModifications = Object.keys(loadsData.mw_data).some(busId => {
    const current = loadsData.mw_data[busId] || []
    const original = loadsData.original_mw_data[busId] || []
    return current.some((val, idx) => Math.abs(val - (original[idx] || 0)) > 0.001)
  })

  return (
    <div className="mt-8 bg-gray-800 border border-gray-700 p-4 rounded relative">
      {/* Copy Success Popup */}
      {showCopyPopup && (
        <div className="absolute top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-10 animate-fade-in">
          ✓ {showCopyPopup === 'mw' ? 'MW' : 'MVar'} data copied to clipboard!
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-medium text-gray-200">
            EV Load Scheduler
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Drag charging blocks between time slots to reschedule EV charging. Cost: 500 EUR/kWh (1 MW × 1 hour = 1 MWh = 500,000 EUR).
          </p>
        </div>

        {/* Export and Reset buttons */}
        <div className="flex gap-2">
          {hasModifications && (
            <button
              onClick={handleReset}
              disabled={applying}
              className="px-3 py-1.5 rounded text-xs font-medium bg-orange-600 text-white hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset all moves to original paste data"
            >
              Reset All
            </button>
          )}
          <button
            onClick={handleExportMW}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            title="Copy MW table to paste into PowerWorld"
          >
            Export MW
          </button>
          <button
            onClick={handleExportMVar}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            title="Copy MVar table to paste into PowerWorld"
          >
            Export MVar
          </button>
        </div>
      </div>

      {/* Bus selector */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {evBusIds.map(id => (
          <button
            key={id}
            onClick={() => setSelectedBus(id)}
            disabled={applying}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              id === selectedBus
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
          >
            Bus {id}
          </button>
        ))}
        
        {applying && (
          <>
            <div className="h-6 w-px bg-gray-600"></div>
            <div className="text-sm text-gray-400 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              Applying move...
            </div>
          </>
        )}
      </div>

      {/* Validation errors */}
      {busErrors.length > 0 && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-600 rounded">
          <div className="text-red-400 font-semibold text-sm mb-1">Validation Errors:</div>
          {busErrors.map((err, idx) => (
            <div key={idx} className="text-red-300 text-xs">
              {err.message}
            </div>
          ))}
        </div>
      )}

      {/* Timeline visualization */}
      <Timeline
        datetime={datetime}
        mwValues={currentBusMW}
        originalMW={originalBusMW}
        onMoveBlock={handleMoveBlock}
      />
    </div>
  )
}
