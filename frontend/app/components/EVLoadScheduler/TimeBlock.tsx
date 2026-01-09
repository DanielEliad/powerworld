'use client'

interface TimeBlockProps {
  mw: number
  mvar: number
  isModified: boolean
  isDragging: boolean
  height: number
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export function TimeBlock({
  mw,
  mvar,
  isModified,
  isDragging,
  height,
  onDragStart,
  onDragEnd
}: TimeBlockProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`w-12 rounded-t cursor-grab active:cursor-grabbing transition-all ${
        isModified
          ? 'bg-yellow-500/70 border border-yellow-400'
          : 'bg-blue-500 border border-blue-400'
      } ${isDragging ? 'shadow-lg scale-105 opacity-50' : 'hover:brightness-110'}`}
      style={{ height: `${height}px` }}
      title={`MW: ${mw.toFixed(3)}\nMVar: ${mvar.toFixed(3)}`}
    >
      <div className="text-[10px] text-white font-medium text-center pt-1 truncate px-1">
        {mw.toFixed(2)}
      </div>
    </div>
  )
}
