export enum LocalStorageKey {
  LINES_DATA = 'powerworld_lines_data',
  GENERATORS_DATA = 'powerworld_generators_data',
  BUSES_DATA = 'powerworld_buses_data',
  LOADS_MW_DATA = 'powerworld_loads_mw_data',
  LOADS_MVAR_DATA = 'powerworld_loads_mvar_data'
}

export enum ApiEndpoint {
  ANALYZE = '/api/analyze',
  UPDATE_BATTERY = '/api/analyze/generators/update-battery',
  RECONSTRUCT_TABLE = '/api/analyze/generators/reconstruct',
  GENERATE_REPORT = '/api/generate-report',
  MOVE_LOADS = '/api/loads/move',
  RESET_LOADS = '/api/loads/reset'
}

export const CHART_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#fbbf24', // yellow
  '#f472b6', // pink
  '#a78bfa', // purple
  '#fb7185', // red
  '#4ade80', // lime
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
]

export const getPlotlyLayout = (
  xTitle: string,
  yTitle: string,
  height: number = 600,
  isTimeSeries: boolean = false
) => ({
  title: '',
  font: { color: '#e5e7eb' },
  paper_bgcolor: '#1f2937',
  plot_bgcolor: '#111827',
  xaxis: {
    title: xTitle,
    gridcolor: '#374151',
    linecolor: '#4b5563',
    titlefont: { color: '#9ca3af' },
    ...(isTimeSeries ? {
      type: 'date' as const,
      tickformat: '%H:%M',
      dtick: 3600000,
      tickmode: 'linear' as const,
    } : {}),
  },
  yaxis: {
    title: yTitle,
    gridcolor: '#374151',
    linecolor: '#4b5563',
    titlefont: { color: '#9ca3af' },
  },
  height,
  hovermode: 'closest' as const,
  showlegend: true,
  legend: {
    bgcolor: '#1f2937',
    bordercolor: '#374151',
    font: { color: '#e5e7eb' },
    orientation: 'h' as const,
    y: -0.15,
    x: 0.5,
    xanchor: 'center' as const,
    yanchor: 'top' as const,
  },
  margin: {
    l: 60,
    r: 60,
    t: 40,
    b: 100,
  },
})

export const PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'] as const,
}
