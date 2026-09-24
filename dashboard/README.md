# DEVSYNX Activity Tracker - Dashboard

React + TypeScript + Vite administration and analytics dashboard for DEVSYNX Activity Tracker.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

The application will launch at `http://localhost:5173`.

### 4. Build for Production
```bash
npm run build
npm run preview
```

---

## 📁 Architecture Overview

- `src/components/`: Reusable UI elements (Header, navigation, cards)
- `src/layouts/`: Page layout wrappers (`MainLayout`)
- `src/pages/`: Route page views (`HomePage`, `NotFoundPage`)
- `src/routes/`: React Router definitions (`AppRoutes`)
- `src/services/`: API client abstractions (`api.ts`)
- `src/types/`: TypeScript interface definitions
