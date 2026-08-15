<p align="center">
  <img src="https://img.shields.io/badge/SPHERE-Frontend-purple?style=for-the-badge&labelColor=0D0D1A&color=7C3AED" />
  <img src="https://img.shields.io/badge/Status-Production--Ready-green?style=for-the-badge&labelColor=0D0D1A&color=10B981" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&labelColor=0D0D1A&color=3B82F6" />
</p>

<h1 align="center">SPHERE Frontend</h1>
<p align="center"><b>UI React para la Plataforma Multi-Agente</b></p>
<p align="center">
  Interfaz de chat con streaming SSE, artefactos interactivos,<br/>
  gestión de agentes custom y sistema de RAG.
</p>

---

## Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| **Framework** | React 19 | Rendimiento, ecosistema maduro |
| **Build** | Vite 7 | HMR rápido, TypeScript nativo |
| **Estado** | Zustand 5 | Simple, sin boilerplate |
| **Estilos** | Tailwind CSS v4 | Utility-first, design system |
| **Auth** | Firebase Auth | Google/GitHub social login |
| **Testing** | Vitest + MSW | Integrado con Vite |

## Quick Start

### Prerrequisitos

- Node.js 20+
- Firebase project
- Backend corriendo (o URL de Railway)

### Paso 1: Configurar

```bash
# Clonar
git clone https://github.com/AndreSaul16/Frontend_SPHERE.git
cd Frontend_SPHERE

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Firebase
```

### Paso 2: Ejecutar

```bash
# Desarrollo local
npm run dev
```

### Paso 3: Verificar

```bash
# Abrir en browser
open http://localhost:3000
```

## Docker

```bash
# Build
docker build -t sphere-frontend .

# Run
docker run -p 3000:3000 sphere-frontend
```

## Estructura

```
frontend/
├── src/
│   ├── components/        # Chat, Sidebar, Artifacts, Modals
│   ├── store/             # Zustand store
│   ├── services/          # API client (REST + SSE)
│   ├── pages/             # Login, Profile, Settings
│   ├── contexts/          # AuthContext (Firebase)
│   ├── types/             # TypeScript interfaces
│   └── lib/               # Firebase config, utils
├── tests/                 # Tests con Vitest + MSW
├── landing/               # La landing de marketing: proyecto Vite APARTE
│                          # (pnpm, sin React, su propio Tailwind y su suite).
│                          # Vive aquí porque el contexto de build de Docker
│                          # es esta carpeta. Se sirve en `/`; la aplicación,
│                          # en el resto de rutas. Ver landing/README.md.
├── Dockerfile             # Construye los dos y los mete en el mismo nginx
└── package.json
```

## Scripts

```bash
# Desarrollo
npm run dev

# Build producción
npm run build

# Preview build
npm run preview

# Tests
npm test

# Lint
npm run lint
```

## Deploy

Ver [RAILWAY.md](RAILWAY.md) para deployment en Railway.

## Licencia

MIT License
