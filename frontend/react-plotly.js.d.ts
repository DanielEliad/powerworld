declare module 'react-plotly.js' {
  import { Component } from 'react'
  import { PlotParams } from 'plotly.js'

  export interface PlotProps extends Partial<PlotParams> {
    data: Partial<PlotParams['data']>
    layout?: Partial<PlotParams['layout']>
    config?: Partial<PlotParams['config']>
    frames?: Partial<PlotParams['frames']>
    useResizeHandler?: boolean
    style?: React.CSSProperties
    className?: string
    divId?: string
    onInitialized?: (figure: Readonly<PlotParams>, graphDiv: HTMLElement) => void
    onUpdate?: (figure: Readonly<PlotParams>, graphDiv: HTMLElement) => void
    onPurge?: (figure: Readonly<PlotParams>, graphDiv: HTMLElement) => void
    onError?: (err: Error) => void
    onClickAnnotation?: (event: any) => void
    onLegendClick?: (event: any) => boolean | void
    onLegendDoubleClick?: (event: any) => boolean | void
    onClick?: (event: any) => void
    onSelected?: (event: any) => void
    onRelayout?: (event: any) => void
    onRestyle?: (event: any) => void
    onRedraw?: () => void
    onAfterExport?: () => void
    onAfterPlot?: () => void
    onAnimated?: () => void
    onAnimatingFrame?: (event: any) => void
    onAnimationInterrupted?: () => void
    onAutoSize?: () => void
    onBeforeExport?: () => void
    onButtonClicked?: (event: any) => void
    onDeselect?: () => void
    onDoubleClick?: () => void
    onFramework?: () => void
    onHover?: (event: any) => void
    onSliderChange?: (event: any) => void
    onSliderEnd?: (event: any) => void
    onSliderStart?: (event: any) => void
    onSunburstClick?: (event: any) => void
    onTransitioning?: () => void
    onTransitionInterrupted?: () => void
    onUnhover?: (event: any) => void
    onWebGlContextLost?: () => void
  }

  export default class Plot extends Component<PlotProps> {}
}
