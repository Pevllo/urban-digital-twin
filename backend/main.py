from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import (
    scenarios,
    developments,
    traffic,
    trip_demand,
    city,
    map,
    water,
    waste,
)
from backend.storage.development_store import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AI Urban Digital Twin API Server",
    description="Backend API for Urban Mobility Simulation & Digital Twin What-If Engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scenarios.router, prefix="/api/v1")
app.include_router(developments.router, prefix="/api/v1")
app.include_router(traffic.router, prefix="/api/v1")
app.include_router(trip_demand.router, prefix="/api/v1")
app.include_router(city.router, prefix="/api/v1")
app.include_router(map.router, prefix="/api/v1")
app.include_router(water.router, prefix="/api/v1")
app.include_router(waste.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    from backend.storage.development_store import count_developments
    return {
        "status": "healthy",
        "service": "Urban Digital Twin API Server",
        "developments_persisted": count_developments(),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
