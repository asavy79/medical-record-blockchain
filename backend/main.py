import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routes import auth, doctors, invites, patients, permissions, records
from services.event_listener import poll_events

# Import models so Base.metadata knows about all tables
import models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("Database tables created")

    # Start blockchain event listener as a background task
    app_state: dict = {"last_block": 0}
    event_task = asyncio.create_task(poll_events(app_state))

    yield

    # Cancel the event listener on shutdown
    event_task.cancel()
    try:
        await event_task
    except asyncio.CancelledError:
        pass
    print("Shutting down...")


app = FastAPI(
    title="Medical Records API",
    description="Blockchain-backed medical records management",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(doctors.router)
app.include_router(records.router)
app.include_router(invites.router)
app.include_router(permissions.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
