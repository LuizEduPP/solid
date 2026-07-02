from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from api.openai import router as openai_router
from config import load_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = load_settings()
    yield


app = FastAPI(
    title="DeepSearch",
    description="OpenAI-compatible iterative web research agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(openai_router, prefix="/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def cli() -> None:
    settings = load_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    cli()
