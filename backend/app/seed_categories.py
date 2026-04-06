import asyncio

from sqlalchemy import select

from app.database import engine, async_session, Base
from app.models import Category

DEFAULT_CATEGORIES = [
    # Despesas
    {"name": "Alimentação", "type": "expense", "icon": "🛒"},
    {"name": "Aluguel", "type": "expense", "icon": "🏠"},
    {"name": "Utilidades", "type": "expense", "icon": "💡"},
    {"name": "Transporte", "type": "expense", "icon": "🚗"},
    {"name": "Restaurantes", "type": "expense", "icon": "🍽️"},
    {"name": "Entretenimento", "type": "expense", "icon": "🎬"},
    {"name": "Saúde", "type": "expense", "icon": "🏥"},
    {"name": "Seguros", "type": "expense", "icon": "🛡️"},
    {"name": "Roupas", "type": "expense", "icon": "👕"},
    {"name": "Educação", "type": "expense", "icon": "📚"},
    {"name": "Assinaturas", "type": "expense", "icon": "📱"},
    {"name": "Cuidados Pessoais", "type": "expense", "icon": "💇"},
    {"name": "Presentes", "type": "expense", "icon": "🎁"},
    {"name": "Viagem", "type": "expense", "icon": "✈️"},
    {"name": "Taxas e Tarifas", "type": "expense", "icon": "🏦"},
    {"name": "Outros Despesa", "type": "expense", "icon": "📦"},
    # Receitas
    {"name": "Salário", "type": "income", "icon": "💰"},
    {"name": "Freelance", "type": "income", "icon": "💻"},
    {"name": "Investimentos", "type": "income", "icon": "📈"},
    {"name": "Reembolso", "type": "income", "icon": "🔄"},
    {"name": "Transferência Recebida", "type": "income", "icon": "➡️"},
    {"name": "Outros Receita", "type": "income", "icon": "💵"},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        result = await session.execute(select(Category).limit(1))
        if result.scalar_one_or_none() is not None:
            print("Categories already seeded.")
            return

        for cat in DEFAULT_CATEGORIES:
            session.add(Category(**cat))
        await session.commit()
        print(f"Seeded {len(DEFAULT_CATEGORIES)} categories.")


if __name__ == "__main__":
    asyncio.run(seed())
