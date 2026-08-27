from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import scenarios, developments, traffic, trip_demand, city, map

app = FastAPI(
    title="AI Urban Digital Twin API Server",
    description="Backend API for Urban Mobility Simulation & Digital Twin What-If Engine",
    version="1.0.0"
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

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Urban Digital Twin API Server"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
