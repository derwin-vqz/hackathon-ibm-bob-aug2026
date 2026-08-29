# Code GPS

Visualizador interactivo de dependencias de repositorios GitHub.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

## Desarrollo

Abre **dos terminales**:

```bash
# Terminal 1 — servidor (puerto 3001)
cd server && npm run dev

# Terminal 2 — cliente (puerto 5173)
cd client && npm run dev
```

Luego abre http://localhost:5173

## Uso

1. Pega una URL de repositorio GitHub (ej: `https://github.com/expressjs/express`)
2. Haz clic en **Analizar**
3. Explora el grafo — haz clic en cualquier nodo para ver sus dependencias directas
4. El panel derecho muestra métricas del nodo seleccionado

### Token de GitHub (opcional)

Sin token: 60 req/hora. Con token PAT: 5000 req/hora.
Clic en 🔑 Token para ingresarlo. Solo necesita permisos de lectura pública.

## Estructura

```
server/
  src/
    index.ts      — Express API
    github.ts     — GitHub API helpers
    analyzer.ts   — Extracción de dependencias
client/
  src/
    App.tsx                    — UI principal
    types.ts                   — Tipos compartidos
    components/
      GraphView.tsx            — Grafo Cytoscape.js
      NodePanel.tsx            — Panel de nodo seleccionado
      StatsBar.tsx             — Métricas e insights
```

## Límites MVP

- Máximo 200 archivos por repositorio
- Solo analiza imports relativos (no deps externas como `react`, `lodash`)
- Solo soporta TypeScript/JavaScript (.ts, .tsx, .js, .jsx, .mjs, .cjs)
