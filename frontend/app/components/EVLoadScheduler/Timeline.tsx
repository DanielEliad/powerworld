'use client'

import { useState } from 'react'
import { formatTime } from '../../lib/utils'

interface TimelineProps {
  datetime: string[]
  mwValues: number[]
  originalMW: number[]
  onMoveBlock: (fromIdx: number, toIdx: number) => void
}

export function Timeline({
  datetime,
  mwValues,
  originalMW,
  onMoveBlock
}: TimelineProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)

  const maxMW = Math.max(...mwValues.filter(v => v > 0), 0.001)

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (Math.abs(mwValues[idx]) < 0.001) {
      e.preventDefault()
      return
    }
    setDraggedIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIdx !== null && idx !== draggedIdx) {
      setDropTargetIdx(idx)
    }
  }

  const handleDragLeave = () => {
    setDropTargetIdx(null)
  }

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'))
    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
      onMoveBlock(fromIdx, toIdx)
    }
    setDraggedIdx(null)
    setDropTargetIdx(null)
  }

  const handleDragEnd = () => {
    setDraggedIdx(null)
    setDropTargetIdx(null)
  }

  const hasChanges = (idx: number) => {
    // Compare current MW to original MW to determine if modified
    const currMW = mwValues[idx] ?? 0
    const origMW = originalMW[idx] ?? 0
    
    return Math.abs(currMW - origMW) > 0.001
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
          <span>Load</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
          <span>Modified</span>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${datetime.length}, minmax(0, 1fr))` }}>
        {datetime.map((dt, idx) => {
          const mw = mwValues[idx] || 0
          const hasLoad = Math.abs(mw) > 0.001
          const isModified = hasChanges(idx)
          const isDragging = draggedIdx === idx
          const isDropTarget = dropTargetIdx === idx

          const barHeight = hasLoad ? Math.max(12, (mw / maxMW) * 80) : 0

          return (
            <div
              key={idx}
              className={`flex flex-col items-center transition-all ${isDragging ? 'opacity-40' : ''}`}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
            >
              {/* Bar area with number above */}
              <div
                className={`w-full h-[100px] flex flex-col justify-end items-center rounded transition-all ${
                  isDropTarget
                    ? 'bg-blue-500/20 ring-1 ring-blue-400'
                    : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  {/* Number above bar - always show */}
                  <div className={`text-[10px] font-medium mb-0.5 ${isModified ? 'text-yellow-300' : 'text-gray-300'}`}>
                    {mw.toFixed(2)}
                  </div>
                  {/* Bar */}
                  {hasLoad ? (
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`w-full max-w-[28px] rounded-t cursor-grab active:cursor-grabbing transition-all ${
                        isModified
                          ? 'bg-yellow-500 hover:bg-yellow-400'
                          : 'bg-blue-500 hover:bg-blue-400'
                      }`}
                      style={{ height: `${barHeight}px` }}
                      title={
                        isModified
                          ? `${formatTime(dt)}\nMW: ${mw.toFixed(3)} (was ${originalMW[idx]?.toFixed(3) || '0.000'})`
                          : `${formatTime(dt)}\nMW: ${mw.toFixed(3)}`
                      }
                    />
                  ) : (
                    <div className="w-full max-w-[28px] h-1 bg-gray-700/50 rounded" />
                  )}
                </div>
              </div>

              {/* Time label */}
              <div className="text-[10px] text-gray-500 mt-1 font-mono">
                {formatTime(dt).slice(0, 2)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="flex justify-between items-center text-xs border-t border-gray-700 pt-2">
        <div className="text-gray-400">
          Total: <span className="text-gray-200 font-medium">{mwValues.reduce((a, b) => a + b, 0).toFixed(2)} MW</span>
        </div>
        <div className="text-gray-500">
          Drag bars to reschedule charging
        </div>
      </div>
    </div>
  )
}
