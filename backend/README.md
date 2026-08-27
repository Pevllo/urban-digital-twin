# Backend API Server — AI Urban Digital Twin

FastAPI REST service providing endpoints for the Urban Digital Twin & What-If Mobility Simulator.

## Architecture

```
backend/
├── api/
│   ├── routes/          # API route handlers
│   ├── services/        # Mobility simulator bridges
│   └── schemas/         # Pydantic data validation schemas
├── main.py              # Server entry point
└── requirements.txt     # Python dependencies
```

## Running the Server

```bash
uvicorn backend.main:app --reload --port 8000
```
