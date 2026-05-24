# Dona Menina Beauty Bar

Sistema de gestao para salao de beleza. App desktop via Electron (Windows .exe).

## Commands

```bash
# Development (with hot reload)
cd backend && npm run dev          # Backend on :4000
cd frontend && npm run dev         # Frontend on :5173 (Vite proxy -> :4000)

# Electron dev (serves built frontend via Express)
npm run electron:dev               # Opens Electron window on :4000

# Build .exe (Windows)
npm run electron:build             # Outputs to release/DonaMenina-1.0.0.exe

# Build check
cd frontend && npx vite build     # Validates all React compiles

# Database reset (delete file, restart backend)
rm data/dona_menina.db && cd backend && npm run dev
```

## Architecture

```
package.json                      # Root: Electron + electron-builder config
electron/
  main.cjs                        # Electron main process: starts Express + BrowserWindow
  preload.cjs                     # Context isolation preload script

backend/                          # Node.js + Express 5.2 + SQLite
  database/schema.sql             # Source of truth for data model
  database/seed.sql               # Demo data (10 clientes, 15 servicos, etc.)
  database/db.js                  # Singleton, WAL mode, foreign keys ON
  routes/                         # 13 route files, all functional
  server.js                       # Express setup, mounts all routes at /api/*
                                  # Also serves static frontend when STATIC_DIR is set

frontend/                         # React 19 + Vite 7 + Tailwind CSS 4
  src/api.js                      # HTTP wrapper — use this for ALL API calls
  src/components/                 # Shared: Toast, Modal, DataTable, etc.
  src/pages/                      # One folder per module
  src/index.css                   # Tailwind v4 @theme with design tokens

scripts/                          # .bat files for Windows users
  setup-dev.bat                   # Install Node.js deps (one time)
  dev.bat                         # Open backend + frontend dev servers
  build.bat                       # Generate .exe
  parar.bat                       # Stop dev processes
  LEIA-ME.txt                     # Instructions in Portuguese

data/                             # SQLite database (auto-created, portable)
```

## Key Conventions

- API responses: always `{ ok: true, data }` or `{ ok: false, error }`
- Frontend API calls: `import api from '../api.js'` — never raw fetch
- Toast feedback: `const toast = useToast(); toast.success/error/warning(msg)`
- Tailwind: `text-primary` (#D4006E), `bg-primary-light`, `font-title`, `text-alert-ok/warning/urgent/danger`
- Currency: `toLocaleString('pt-BR', { minimumFractionDigits: 2 })` with R$ prefix
- All UI text in Portuguese (pt-BR)
- Soft deletes: clientes.ativa, atendimentos.cancelado
- SQL: parameterized queries only, multi-table mutations in db.transaction()

## Component API Quick Reference

```
Modal:          open, onClose, title, children, wide (boolean for larger modal)
ConfirmDialog:  open, onClose, onConfirm, title, message, confirmText, danger
DataTable:      columns, data, emptyMessage, onRowClick
SearchInput:    value, onChange, placeholder
FormField:      label, error, required, children
Autocomplete:   placeholder, fetchOptions, onSelect, displayKey, renderOption
Toast:          import { useToast } from './components/Toast.jsx'
```

## Specs

Reference specs at parent directory: `../00_visao_geral_e_arquitetura.md` through `../07_utilitarios.md`

## Gotchas

- Tailwind v4 uses CSS-first config (`@theme` in index.css), NOT tailwind.config.js
- Express 5 has native async handler support — no express-async-errors needed
- React Router v7 uses `import { X } from 'react-router'` (not react-router-dom)
- Vite 7 (not 8) due to @tailwindcss/vite compatibility
- Kit stock decrement uses `servicos.consome_kit_mao/consome_kit_pe` flags (not string matching)
- Atendimento POST is atomic transaction: items + payments + commissions + stock in one `db.transaction()`
- Modal uses `open` prop (not `isOpen`) and `wide` prop (not `size`)
- ConfirmDialog uses `open` prop (not `isOpen`)
