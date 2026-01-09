'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LocalStorageKey } from '../lib/constants'
import { api } from './useApi'
import {
  AnalysisResult,
  GeneratorsData,
  BatteryTable,
  BatteryCost,
  BudgetSummary,
  ValidationError
} from '../types'

export interface PasteData {
  lines: string
  generators: string
  buses: string
  loadsMW: string
  loadsMVar: string
}

export interface LoadMoveOperation {
  bus_id: string
  from_index: number
  to_index: number
  mw_value: number
}

export interface EditedLoads {
  [busId: string]: {
    mw?: number[]
    mvar?: number[]
  }
}

export function useAnalysisData() {
  const [pasteData, setPasteDataState] = useState<PasteData>({
    lines: '',
    generators: '',
    buses: '',
    loadsMW: '',
    loadsMVar: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(AnalysisResult.empty())
  const [editedLoads, setEditedLoads] = useState<EditedLoads>({})

  const recomputeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRecomputingRef = useRef<boolean>(false)
  const recomputeAllRef = useRef<(() => Promise<void>) | null>(null)
  const batteryUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const buildEditedLoadPasteStringsRef = useRef<(() => { mw: string | null; mvar: string | null }) | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const savedLines = localStorage.getItem(LocalStorageKey.LINES_DATA)
    const savedGenerators = localStorage.getItem(LocalStorageKey.GENERATORS_DATA)
    const savedBuses = localStorage.getItem(LocalStorageKey.BUSES_DATA)
    const savedLoadsMW = localStorage.getItem(LocalStorageKey.LOADS_MW_DATA)
    const savedLoadsMVar = localStorage.getItem(LocalStorageKey.LOADS_MVAR_DATA)

    setPasteDataState({
      lines: savedLines || '',
      generators: savedGenerators || '',
      buses: savedBuses || '',
      loadsMW: savedLoadsMW || '',
      loadsMVar: savedLoadsMVar || ''
    })
  }, [])

  // Save to localStorage when paste data changes
  useEffect(() => {
    if (pasteData.lines) localStorage.setItem(LocalStorageKey.LINES_DATA, pasteData.lines)
  }, [pasteData.lines])

  useEffect(() => {
    if (pasteData.generators) localStorage.setItem(LocalStorageKey.GENERATORS_DATA, pasteData.generators)
  }, [pasteData.generators])

  useEffect(() => {
    if (pasteData.buses) localStorage.setItem(LocalStorageKey.BUSES_DATA, pasteData.buses)
  }, [pasteData.buses])

  useEffect(() => {
    if (pasteData.loadsMW) localStorage.setItem(LocalStorageKey.LOADS_MW_DATA, pasteData.loadsMW)
  }, [pasteData.loadsMW])

  useEffect(() => {
    if (pasteData.loadsMVar) localStorage.setItem(LocalStorageKey.LOADS_MVAR_DATA, pasteData.loadsMVar)
  }, [pasteData.loadsMVar])

  const buildEditedLoadPasteStrings = useCallback((): { mw: string | null; mvar: string | null } => {
    if (!analysisResult.loads || Object.keys(editedLoads).length === 0) {
      return { mw: pasteData.loadsMW || null, mvar: pasteData.loadsMVar || null }
    }

    const loads = analysisResult.loads
    const columns = loads.columns

    const buildForKind = (kind: 'mw' | 'mvar'): string | null => {
      const hasAnyEdits = Object.values(editedLoads).some(
        e => (kind === 'mw' ? e.mw : e.mvar)?.length
      )
      if (!hasAnyEdits) {
        return kind === 'mw' ? (pasteData.loadsMW || null) : (pasteData.loadsMVar || null)
      }

      // Check if we have any columns of this kind in the original data
      const hasAnyColumnsOfKind = Object.values(loads.load_by_bus).some(
        bus => kind === 'mw' ? bus.mw_col : bus.mvar_col
      )
      
      // If original paste didn't have this kind of data, don't send it
      if (!hasAnyColumnsOfKind) {
        return kind === 'mw' ? (pasteData.loadsMW || null) : (pasteData.loadsMVar || null)
      }

      const data = loads.data.map(record => ({ ...record }))
      Object.entries(editedLoads).forEach(([busId, series]) => {
        const colName = kind === 'mw'
          ? loads.load_by_bus[busId]?.mw_col
          : loads.load_by_bus[busId]?.mvar_col
        const editedSeries = kind === 'mw' ? series.mw : series.mvar
        if (!colName || !editedSeries) return

        editedSeries.forEach((val, idx) => {
          if (idx < data.length) {
            data[idx][colName] = val
          }
        })
      })

      const headerLine = columns.join('\t')
      const dataLines = data.map(record =>
        columns.map(col => String(record[col] ?? '')).join('\t')
      )

      const lines = [
        'Timepoint',
        headerLine,
        ...dataLines,
      ]
      return lines.join('\n')
    }

    return {
      mw: buildForKind('mw'),
      mvar: buildForKind('mvar'),
    }
  }, [analysisResult.loads, editedLoads, pasteData.loadsMW, pasteData.loadsMVar])

  // Store latest buildEditedLoadPasteStrings in ref
  useEffect(() => {
    buildEditedLoadPasteStringsRef.current = buildEditedLoadPasteStrings
  }, [buildEditedLoadPasteStrings])

  const recomputeAll = useCallback(async () => {
    if (isRecomputingRef.current) return

    const hasData = pasteData.lines || pasteData.generators || pasteData.buses || pasteData.loadsMW || pasteData.loadsMVar
    if (!hasData) {
      setError('No data to process')
      return
    }

    isRecomputingRef.current = true
    setLoading(true)
    setError('')

    try {
      // Use ref to get latest version without recreating this callback
      const edited = buildEditedLoadPasteStringsRef.current?.() || { mw: pasteData.loadsMW || null, mvar: pasteData.loadsMVar || null }

      const result = await api.analyze({
        lines_data: pasteData.lines || null,
        generators_data: pasteData.generators || null,
        buses_data: pasteData.buses || null,
        loads_mw_data: edited.mw,
        loads_mvar_data: edited.mvar,
      })

      setAnalysisResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
      isRecomputingRef.current = false
    }
  }, [pasteData.lines, pasteData.generators, pasteData.buses, pasteData.loadsMW, pasteData.loadsMVar])

  // Store latest recomputeAll in ref
  useEffect(() => {
    recomputeAllRef.current = recomputeAll
  }, [recomputeAll])

  // Recompute when paste data changes
  useEffect(() => {
    const hasData = pasteData.lines || pasteData.generators || pasteData.buses || pasteData.loadsMW || pasteData.loadsMVar
    if (!hasData) return
    recomputeAllRef.current?.()
  }, [pasteData.lines, pasteData.generators, pasteData.buses, pasteData.loadsMW, pasteData.loadsMVar])

  // Clear edited loads when loads data structure changes
  useEffect(() => {
    if (!analysisResult.loads || analysisResult.loads.is_first_paste) {
      setEditedLoads(prev => {
        // Only update if actually different
        if (Object.keys(prev).length === 0) return prev
        return {}
      })
      return
    }

    setEditedLoads(prev => {
      const cleaned: EditedLoads = {}
      const busIds = Object.keys(analysisResult.loads!.load_by_bus || {})
      const expectedLength = analysisResult.loads!.datetime?.length || 0

      Object.entries(prev).forEach(([busId, series]) => {
        if (!busIds.includes(busId)) return
        const cleanedSeries: { mw?: number[]; mvar?: number[] } = {}
        if (series.mw && series.mw.length === expectedLength) {
          cleanedSeries.mw = series.mw
        }
        if (series.mvar && series.mvar.length === expectedLength) {
          cleanedSeries.mvar = series.mvar
        }
        if (cleanedSeries.mw || cleanedSeries.mvar) {
          cleaned[busId] = cleanedSeries
        }
      })

      // Only update if actually different
      const prevKeys = Object.keys(prev).sort()
      const cleanedKeys = Object.keys(cleaned).sort()
      if (prevKeys.length === cleanedKeys.length && 
          prevKeys.every((key, i) => key === cleanedKeys[i])) {
        return prev // No change, return same reference
      }

      return cleaned
    })
  }, [analysisResult.loads])

  // Debounced recompute when edited loads change
  useEffect(() => {
    if (!analysisResult.loads || analysisResult.loads.is_first_paste || Object.keys(editedLoads).length === 0) {
      if (recomputeTimeoutRef.current) {
        clearTimeout(recomputeTimeoutRef.current)
        recomputeTimeoutRef.current = null
      }
      return
    }

    if (recomputeTimeoutRef.current) {
      clearTimeout(recomputeTimeoutRef.current)
    }

    recomputeTimeoutRef.current = setTimeout(() => {
      if (!isRecomputingRef.current) {
        recomputeAllRef.current?.()
      }
      recomputeTimeoutRef.current = null
    }, 800)

    return () => {
      if (recomputeTimeoutRef.current) {
        clearTimeout(recomputeTimeoutRef.current)
        recomputeTimeoutRef.current = null
      }
    }
  }, [editedLoads, analysisResult.loads])

  const setPasteData = useCallback((key: keyof PasteData, value: string) => {
    setPasteDataState(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateBatteryValue = useCallback((rowIndex: number, genName: string, newValue: number) => {
    if (!analysisResult.generators) return

    const currentGenerators = analysisResult.generators
    const newBatteryTableData = [...currentGenerators.battery_table.data]
    newBatteryTableData[rowIndex] = {
      ...newBatteryTableData[rowIndex],
      [genName]: newValue
    }

    // Update local state immediately for responsive UI
    setAnalysisResult(prev => {
      if (!prev.generators) return prev
      const updatedGenerators = new GeneratorsData(
        prev.generators.columns,
        prev.generators.rows,
        prev.generators.data,
        prev.generators.datetime,
        prev.generators.generators,
        prev.generators.generator_columns,
        prev.generators.battery_capacity,
        prev.generators.battery_by_bus,
        new BatteryTable(
          prev.generators.battery_table.columns,
          newBatteryTableData,
          prev.generators.battery_table.metadata
        ),
        prev.generators.validation_errors,
        prev.generators.battery_costs
      )
      return prev.withGenerators(updatedGenerators)
    })

    // Clear any pending battery update
    if (batteryUpdateTimeoutRef.current) {
      clearTimeout(batteryUpdateTimeoutRef.current)
    }

    // Debounce the backend update
    batteryUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.updateBattery({
          battery_table_data: newBatteryTableData,
          datetime: currentGenerators.datetime
        })

        setAnalysisResult(prev => {
          if (!prev.generators) return prev
          const updatedGenerators = new GeneratorsData(
            prev.generators.columns,
            prev.generators.rows,
            prev.generators.data,
            prev.generators.datetime,
            prev.generators.generators,
            prev.generators.generator_columns,
            response.battery_capacity,
            prev.generators.battery_by_bus,
            prev.generators.battery_table,
            response.validation_errors,
            response.battery_costs
          )
          return prev.withGenerators(updatedGenerators).withBudgetSummary(response.budget_summary)
        })

        // Reconstruct and save the generator paste string to localStorage
        const reconstructedData = await api.reconstructTable({
          battery_table_data: newBatteryTableData,
          original_columns: currentGenerators.columns,
          original_data: currentGenerators.data
        })
        setPasteDataState(prev => ({ ...prev, generators: reconstructedData }))
      } catch (err) {
        console.error('Error updating battery capacity:', err)
      }
      
      batteryUpdateTimeoutRef.current = null
    }, 800)
  }, [analysisResult.generators])

  const exportBatteryToClipboard = useCallback(async (): Promise<boolean> => {
    if (!analysisResult.generators) return false

    try {
      const data = await api.reconstructTable({
        battery_table_data: analysisResult.generators.battery_table.data,
        original_columns: analysisResult.generators.columns,
        original_data: analysisResult.generators.data
      })
      await navigator.clipboard.writeText(data)
      return true
    } catch (err) {
      console.error('Error exporting battery data:', err)
      return false
    }
  }, [analysisResult.generators])

  const applyLoadMoves = useCallback(async (operations: LoadMoveOperation[]): Promise<{ mw: string; mvar: string | null; current_mw_data?: Record<string, number[]>; original_mw_data?: Record<string, number[]> } | null> => {
    if (operations.length === 0) return null

    try {
      const result = await api.moveLoads({ operations })
      
      // Update the local paste data with the new strings
      if (result.loads_mw_paste) {
        setPasteDataState(prev => ({ ...prev, loadsMW: result.loads_mw_paste }))
      }
      if (result.loads_mvar_paste) {
        setPasteDataState(prev => ({ ...prev, loadsMVar: result.loads_mvar_paste || '' }))
      }

      return {
        mw: result.loads_mw_paste,
        mvar: result.loads_mvar_paste,
        current_mw_data: result.current_mw_data,
        original_mw_data: result.original_mw_data
      }
    } catch (err) {
      console.error('Error applying load moves:', err)
      setError(err instanceof Error ? err.message : 'Failed to apply load moves')
      return null
    }
  }, [])

  const exportLoadMWToClipboard = useCallback(async (): Promise<boolean> => {
    if (!pasteData.loadsMW) return false

    try {
      await navigator.clipboard.writeText(pasteData.loadsMW)
      return true
    } catch (err) {
      console.error('Error exporting load MW data:', err)
      return false
    }
  }, [pasteData.loadsMW])

  const exportLoadMVarToClipboard = useCallback(async (): Promise<boolean> => {
    if (!pasteData.loadsMVar) return false

    try {
      await navigator.clipboard.writeText(pasteData.loadsMVar)
      return true
    } catch (err) {
      console.error('Error exporting load MVar data:', err)
      return false
    }
  }, [pasteData.loadsMVar])

  const resetLoadMoves = useCallback(async (): Promise<{ mw: string; mvar: string | null; current_mw_data?: Record<string, number[]>; original_mw_data?: Record<string, number[]> } | null> => {
    try {
      const result = await api.resetLoads()
      
      // Update the local paste data with the reset strings
      if (result.loads_mw_paste) {
        setPasteDataState(prev => ({ ...prev, loadsMW: result.loads_mw_paste }))
      }
      if (result.loads_mvar_paste) {
        setPasteDataState(prev => ({ ...prev, loadsMVar: result.loads_mvar_paste || '' }))
      }

      return {
        mw: result.loads_mw_paste,
        mvar: result.loads_mvar_paste,
        current_mw_data: result.current_mw_data,
        original_mw_data: result.original_mw_data
      }
    } catch (err) {
      console.error('Error resetting load moves:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset load moves')
      return null
    }
  }, [])

  // Cleanup battery update timeout on unmount
  useEffect(() => {
    return () => {
      if (batteryUpdateTimeoutRef.current) {
        clearTimeout(batteryUpdateTimeoutRef.current)
      }
    }
  }, [])

  return {
    pasteData,
    setPasteData,
    loading,
    error,
    analysisResult,
    editedLoads,
    setEditedLoads,
    updateBatteryValue,
    exportBatteryToClipboard,
    applyLoadMoves,
    resetLoadMoves,
    exportLoadMWToClipboard,
    exportLoadMVarToClipboard,
    recomputeAll
  }
}
