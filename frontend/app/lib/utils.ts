export function formatTime(dt: string): string {
  try {
    const date = new Date(dt)
    const hours = date.getHours()
    const minutes = date.getMinutes()
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  } catch {
    return dt
  }
}

export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function getHourFromTimestep(datetime: string[], timestep: number): string {
  if (timestep < datetime.length) {
    const dt = datetime[timestep]
    return formatTime(dt)
  }
  return `timestep ${timestep}`
}
