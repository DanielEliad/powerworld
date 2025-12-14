import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PowerWorld Simulation Analyzer',
  description: 'Analyze PowerWorld simulation CSV files with interactive visualizations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-900">{children}</body>
    </html>
  )
}

