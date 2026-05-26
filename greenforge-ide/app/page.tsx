'use client'

import dynamic from 'next/dynamic'

// Importar IDELayout dinamicamente para evitar problemas de SSR com CodeMirror
const IDELayout = dynamic(
  () => import('@/components/ide/ide-layout').then(mod => mod.IDELayout),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen bg-[#1e1e2e] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando GreenForge IDE...</p>
        </div>
      </div>
    )
  }
)

export default function Home() {
  return <IDELayout />
}
