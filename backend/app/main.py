import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_v1_router
from app.services.state_store import state_store
from app.services.scenario_benchmark import scenario_runner
from app.models.contracts import (
    SensorReadingContract,
    SensorType,
    MeasurementUnit,
    DataSource,
    SensorHealthStatus,
)


async def simulation_background_loop():
    """Background task to advance active scenario simulation in real-time."""
    while True:
        try:
            if scenario_runner.is_running:
                scenario_runner.step(dt=0.5)
            await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            break
        except Exception as e:
            # Prevent background loop from crashing
            await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application Lifespan Manager.
    Seeds initial baseline sensors and starts background simulation loop.
    """
    if settings.SYSTEM_MODE == "SIMULATION":
        # Seed initial baseline state
        state_store.ingest_reading(
            SensorReadingContract(
                sensor_id="US_UPSTREAM_01",
                section_id="SEC_SCREENING",
                sensor_type=SensorType.WATER_LEVEL,
                value=4.8,
                unit=MeasurementUnit.CENTIMETRE,
                source=DataSource.SIMULATED,
                status=SensorHealthStatus.OK,
                metadata={"description": "Upstream water level before primary net"}
            )
        )
        state_store.ingest_reading(
            SensorReadingContract(
                sensor_id="US_WEIR_02",
                section_id="SEC_OUTLET",
                sensor_type=SensorType.WATER_LEVEL,
                value=1.5,
                unit=MeasurementUnit.CENTIMETRE,
                source=DataSource.SIMULATED,
                status=SensorHealthStatus.OK,
                metadata={"description": "Head over sharp-crested outlet weir"}
            )
        )
        state_store.ingest_reading(
            SensorReadingContract(
                sensor_id="PUMP_INFLOW_01",
                section_id="SEC_INFLOW",
                sensor_type=SensorType.FLOW_RATE,
                value=5.0,
                unit=MeasurementUnit.LITRES_PER_MINUTE,
                source=DataSource.SIMULATED,
                status=SensorHealthStatus.OK,
                metadata={"description": "Calibrated pump circulation inflow"}
            )
        )

    # Start simulation worker task
    sim_task = asyncio.create_task(simulation_background_loop())
    yield
    # Cleanup task
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="DRAIN-X Modular Monolith Backend: Authoritative state, simulation engine, and predictive monitoring.",
    lifespan=lifespan,
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Root"])
async def root():
    return {
        "project": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": state_store.mode,
        "docs_url": "/docs",
        "api_v1": settings.API_V1_PREFIX
    }
