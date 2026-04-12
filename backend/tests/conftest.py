from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models import Category, SalaryConfig


@pytest.fixture(scope="session")
def test_db_path() -> Path:
    temp_dir = Path(__file__).resolve().parent / ".tmp"
    temp_dir.mkdir(exist_ok=True)
    db_path = temp_dir / "test.db"
    if db_path.exists():
        db_path.unlink()
    return db_path


@pytest.fixture(scope="session")
async def test_engine(test_db_path: Path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{test_db_path}", future=True)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
def session_factory(test_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def reset_database(test_engine) -> AsyncIterator[None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
def test_app(session_factory: async_sessionmaker[AsyncSession]):
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(test_app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest.fixture
async def expense_category(session_factory: async_sessionmaker[AsyncSession]) -> Category:
    async with session_factory() as session:
        category = Category(name="Mercado", type="expense", icon="shopping_cart")
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category


@pytest.fixture
async def income_category(session_factory: async_sessionmaker[AsyncSession]) -> Category:
    async with session_factory() as session:
        category = Category(name="Salario", type="income", icon="payments")
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category


@pytest.fixture
async def salary_config(session_factory: async_sessionmaker[AsyncSession]) -> SalaryConfig:
    async with session_factory() as session:
        config = SalaryConfig(
            base_salary=5000,
            overtime_hour_rate=25,
            meal_allowance=600,
            health_plan_deduction=150,
        )
        session.add(config)
        await session.commit()
        await session.refresh(config)
        return config
