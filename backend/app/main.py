from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import transactions, categories, imports, dashboard, salary, incomes


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Finance App", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(salary.router, prefix="/api/salary", tags=["salary"])
app.include_router(incomes.router, prefix="/api/incomes", tags=["incomes"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
