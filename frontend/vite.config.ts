import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sprint 2 item 17 (revisão técnica §5.1): primeira suíte de teste do
  // frontend. Sem `environment: 'jsdom'` de propósito — as duas primeiras
  // suítes (`lib/recommendation.ts`, `sortScores` de `ChampionsPage.tsx`)
  // são funções puras, sem DOM nenhum envolvido; adicionar jsdom só quando
  // o primeiro teste de componente precisar dele.
  test: {
    include: ['src/**/*.test.ts'],
  },
})
