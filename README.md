# Traffic Simulation System

This project is a web-based traffic simulation and analysis system for a single signalized intersection. It allows a user to enter geometry, traffic demand, and signal timing data, then review HCM-oriented results and a canvas-based traffic simulation.

## Main Features

- Geometry input by approach and lane-group composition
- Traffic input by approach, including HCM lane-group fields
- Signal timing input with structured phase movement permissions
- HCM-oriented results for delay, LOS, queue, and v/c-related outputs
- Canvas-based intersection simulation with moving vehicles and signal changes
- Baseline versus proposed comparison workflow
- Scenario import using a JSON template

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS

## Project Structure

```text
ui_simulation/
├─ frontend/
│  ├─ public/
│  ├─ src/
│  │  ├─ features/
│  │  ├─ hcm/
│  │  ├─ pages/
│  │  ├─ types/
│  │  └─ utils/
│  ├─ package.json
│  └─ vite.config.ts
├─ scenario_import_template.json
└─ REQUIREMENTS.md
```

## Requirements

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the software requirements and environment needed to run the project.

## How To Run The Project

1. Open a terminal in the project folder:

```powershell
cd frontend
```

2. Install dependencies:

```powershell
npm install
```

3. Start the development server:

```powershell
npm run dev
```

4. Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Build For Production

```powershell
cd frontend
npx tsc -b
npm run build
```

## Preview Production Build

```powershell
cd frontend
npm run preview
```

## Scenario Import

A sample import file is included:

- [scenario_import_template.json](./scenario_import_template.json)

To use it:

1. Open the Dashboard page
2. Click `Import Scenario`
3. Select `scenario_import_template.json`
4. Run the analysis again after import

## Notes

- This submission is frontend-only.
- The system is designed for a single signalized intersection prototype.
- The analysis is HCM-oriented and the simulation is custom-built without SUMO.
