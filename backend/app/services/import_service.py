from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankImport, StagedTransaction, Transaction, Category
from app.services import parser_service, llm_service


async def get_categories_for_llm(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Category))
    categories = result.scalars().all()
    return [{"name": c.name, "type": c.type} for c in categories]


async def get_category_map(db: AsyncSession) -> dict[str, int]:
    result = await db.execute(select(Category))
    return {c.name: c.id for c in result.scalars().all()}


async def process_import(bank_import_id: int, db: AsyncSession) -> int:
    """Process an uploaded file: parse, send to LLM, create staged transactions."""
    bank_import = await db.get(BankImport, bank_import_id)
    if not bank_import:
        raise ValueError("Import not found")

    bank_import.status = "processing"
    await db.commit()

    try:
        file_path = Path("uploads") / bank_import.filename
        categories = await get_categories_for_llm(db)
        category_map = await get_category_map(db)

        if bank_import.file_type == "csv":
            parsed_rows = parser_service.parse_csv(file_path)
            llm_results = await llm_service.categorize_transactions(parsed_rows, categories)

            for i, llm_row in enumerate(llm_results):
                original_row = parsed_rows[llm_row.get("index", i)] if llm_row.get("index", i) < len(parsed_rows) else None

                raw_amount = _parse_amount(original_row["amount"] if original_row else str(llm_row.get("amount", 0)))
                staged = StagedTransaction(
                    bank_import_id=bank_import_id,
                    date=_parse_date(original_row["date"] if original_row else llm_row.get("date", "")),
                    description=llm_row.get("cleaned_description", original_row["description"] if original_row else ""),
                    # Always store amounts as positive — direction is encoded in `type`
                    amount=abs(raw_amount),
                    type=llm_row.get("type", "expense"),
                    category_id=category_map.get(llm_row.get("category", "")),
                    confidence=Decimal(str(llm_row.get("confidence", 0))),
                    original_text=original_row.get("original_text") if original_row else None,
                    accepted=True,
                )
                db.add(staged)

        elif bank_import.file_type == "pdf":
            pdf_text = parser_service.extract_pdf_text(file_path)
            llm_results = await llm_service.extract_and_categorize_pdf(pdf_text, categories)

            for llm_row in llm_results:
                raw_amount = _parse_amount(str(llm_row.get("amount", 0)))
                staged = StagedTransaction(
                    bank_import_id=bank_import_id,
                    date=_parse_date(llm_row.get("date", "")),
                    description=llm_row.get("cleaned_description", llm_row.get("description", "")),
                    # Always store amounts as positive — direction is encoded in `type`
                    amount=abs(raw_amount),
                    type=llm_row.get("type", "expense"),
                    category_id=category_map.get(llm_row.get("category", "")),
                    confidence=Decimal(str(llm_row.get("confidence", 0))),
                    original_text=llm_row.get("description"),
                    accepted=True,
                )
                db.add(staged)

        bank_import.row_count = len(llm_results)
        bank_import.status = "review"
        await db.commit()
        return len(llm_results)

    except Exception as e:
        bank_import.status = "failed"
        bank_import.error_message = str(e)
        await db.commit()
        raise


async def confirm_import(bank_import_id: int, db: AsyncSession) -> dict:
    """Move accepted staged transactions into the transactions table.

    Income entries (salaries, refunds) are skipped intentionally — those are
    managed exclusively from the Rendimentos screen, not from bank statements.
    """
    result = await db.execute(
        select(StagedTransaction).where(
            StagedTransaction.bank_import_id == bank_import_id,
            StagedTransaction.accepted == True,
        )
    )
    staged_rows = result.scalars().all()

    created = 0
    skipped_income = 0
    for staged in staged_rows:
        if staged.type == "income":
            skipped_income += 1
            continue
        transaction = Transaction(
            date=staged.date,
            description=staged.description,
            amount=staged.amount,
            type=staged.type,
            category_id=staged.category_id,
            bank_import_id=bank_import_id,
        )
        db.add(transaction)
        created += 1

    bank_import = await db.get(BankImport, bank_import_id)
    bank_import.status = "completed"
    await db.commit()
    return {"created": created, "skipped_income": skipped_income}


def _parse_date(value: str) -> date:
    try:
        return parser_service.parse_date(value)
    except ValueError:
        return date.today()


def _parse_amount(value: str) -> Decimal:
    try:
        return parser_service.parse_brazilian_number(value)
    except (InvalidOperation, ValueError):
        return Decimal("0")
