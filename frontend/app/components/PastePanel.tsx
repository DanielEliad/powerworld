'use client'

import { useRef } from 'react'
import { PasteData } from '../hooks/useAnalysisData'

interface PastePanelProps {
  pasteData: PasteData
  onPasteDataChange: (key: keyof PasteData, value: string) => void
  onRefresh: () => void
  loading: boolean
}

export function PastePanel({
  pasteData,
  onPasteDataChange,
  onRefresh,
  loading
}: PastePanelProps) {
  const hasData = pasteData.lines || pasteData.generators || pasteData.buses || pasteData.loadsMW || pasteData.loadsMVar

  return (
    <div className="absolute right-0 top-full mt-2 w-[900px] max-w-[95vw] bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
      <div className="p-4">
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700 rounded">
          <p className="text-blue-300 text-sm font-semibold mb-1">Important: Battery Naming</p>
          <p className="text-gray-300 text-xs">When adding a new generator as a battery in PowerWorld, put "BT" in the ID field for it to be identified as a battery in the analysis.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PasteArea
            title="Lines Data"
            value={pasteData.lines}
            onChange={(val) => onPasteDataChange('lines', val)}
            placeholder="Paste lines data here (Date, Time, Skip, branch columns...)"
            instructions={
              <>
                <p className="font-semibold text-gray-300 mb-1">How to get from PowerWorld:</p>
                <p>1. Run your simulation in PowerWorld</p>
                <p>2. Go to <span className="text-gray-300">TSB Results → Lines</span></p>
                <p>3. Click <span className="text-gray-300">View/Modify</span> at the top</p>
                <p>4. Set <span className="text-gray-300">Selected for storing: YES</span> for all</p>
                <p>5. Click <span className="text-gray-300">Add / Remove Fields</span></p>
                <p>6. Make sure you have both:</p>
                <p className="ml-2">- <span className="text-gray-300">MW\MW at From Bus</span></p>
                <p className="ml-2">- <span className="text-gray-300">Limit Monitoring \ % of MVA limit at From Bus</span></p>
                <p>7. Right-click <span className="text-gray-300">Copy/Paste/Send → Copy All</span></p>
                <p>8. Paste the table here</p>
              </>
            }
          />

          <PasteArea
            title="Generators Data"
            value={pasteData.generators}
            onChange={(val) => onPasteDataChange('generators', val)}
            placeholder="Paste generators data here (Date, Time, Gen columns...)"
            instructions={
              <>
                <p className="font-semibold text-gray-300 mb-1">How to get from PowerWorld:</p>
                <p>1. Run your simulation in PowerWorld</p>
                <p>2. Go to <span className="text-gray-300">TSB Input → Gen Actual MW</span></p>
                <p>3. Right-click on the Generators table</p>
                <p>4. Select <span className="text-gray-300">Timepoint Records → Insert/Scale Generator Columns</span></p>
                <p>5. Pick all the new batteries you added</p>
                <p>6. Click the blue arrow and save</p>
                <p>7. Right-click <span className="text-gray-300">Copy/Paste/Send → Copy All</span></p>
                <p>8. Paste the entire table here</p>
              </>
            }
          />

          <PasteArea
            title="Buses Data"
            value={pasteData.buses}
            onChange={(val) => onPasteDataChange('buses', val)}
            placeholder="Paste buses data here (Date, Time, Skip, PU Volt columns...)"
            instructions={
              <>
                <p className="font-semibold text-gray-300 mb-1">How to get from PowerWorld:</p>
                <p>1. Run your simulation in PowerWorld</p>
                <p>2. Go to <span className="text-gray-300">TSB Results → Buses</span></p>
                <p>3. Set <span className="text-gray-300">Selected for storing: YES</span> for all</p>
                <p>4. Make sure you have the field:</p>
                <p className="ml-2">- <span className="text-gray-300">Voltage\Per Unit Magnitude</span></p>
                <p>5. Right-click <span className="text-gray-300">Copy/Paste/Send → Copy All</span></p>
                <p>6. Paste the entire table here</p>
              </>
            }
          />

          <PasteArea
            title="Loads Data - MW (Active Power)"
            value={pasteData.loadsMW}
            onChange={(val) => onPasteDataChange('loadsMW', val)}
            placeholder="Paste MW loads data here (Date, Time, Bus n #EV MW columns...)"
            instructions={
              <>
                <p className="font-semibold text-gray-300 mb-1">How to get from PowerWorld:</p>
                <p>1. Run your simulation in PowerWorld</p>
                <p>2. Go to <span className="text-gray-300">TSB Results → Loads</span></p>
                <p>3. Set <span className="text-gray-300">Selected for storing: YES</span> for all</p>
                <p>4. Make sure you have:</p>
                <p className="ml-2">- <span className="text-gray-300">Bus n #EV MW</span></p>
                <p>5. Right-click <span className="text-gray-300">Copy/Paste/Send → Copy All</span></p>
                <p>6. Paste the entire table here</p>
                <p className="mt-2 text-yellow-300 font-semibold">Note: Only #EV loads can be changed. Energy can only be moved within the same bus. Budget: 500 EUR per kWh moved.</p>
              </>
            }
          />

          <PasteArea
            title="Loads Data - MVar (Reactive Power)"
            value={pasteData.loadsMVar}
            onChange={(val) => onPasteDataChange('loadsMVar', val)}
            placeholder="Paste MVar loads data here (Date, Time, Bus n #EV Mvar columns...)"
            instructions={
              <>
                <p className="font-semibold text-gray-300 mb-1">How to get from PowerWorld:</p>
                <p>1. Run your simulation in PowerWorld</p>
                <p>2. Go to <span className="text-gray-300">TSB Results → Loads</span></p>
                <p>3. Set <span className="text-gray-300">Selected for storing: YES</span> for all</p>
                <p>4. Make sure you have:</p>
                <p className="ml-2">- <span className="text-gray-300">Bus n #EV Mvar</span></p>
                <p>5. Right-click <span className="text-gray-300">Copy/Paste/Send → Copy All</span></p>
                <p>6. Paste the entire table here</p>
                <p className="mt-2 text-yellow-300 font-semibold">Note: Only #EV loads can be changed. Energy can only be moved within the same bus. Budget: 500 EUR per kWh moved.</p>
              </>
            }
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={onRefresh}
            disabled={loading || !hasData}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PasteAreaProps {
  title: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  instructions: React.ReactNode
}

function PasteArea({ title, value, onChange, placeholder, instructions }: PasteAreaProps) {
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    onChange(pasted)
  }

  return (
    <div className="border border-gray-700 rounded p-4 bg-gray-800/50 flex flex-col">
      <p className="mb-2 text-gray-300 text-sm font-medium">{title}</p>
      <div className="mb-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400 min-h-[250px]">
        {instructions}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        placeholder={placeholder}
        className="w-full h-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 text-xs font-mono focus:outline-none focus:border-gray-500 resize-none"
      />
    </div>
  )
}
