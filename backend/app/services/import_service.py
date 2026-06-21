import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankImport, StagedTransaction, Transaction, Category
from app.services import parser_service, llm_service, docling_service, category_learning

logger = logging.getLogger(__name__)


async def get_categories_for_llm(db: AsyncSession, user_id: int) -> list[dict]:
    result = await db.execute(select(Category).where(Category.user_id == user_id))
    categories = result.scalars().all()
    return [{"name": c.name, "type": c.type} for c in categories]


async def get_category_map(db: AsyncSession, user_id: int) -> dict[str, int]:
    result = await db.execute(select(Category).where(Category.user_id == user_id))
    return {c.name: c.id for c in result.scalars().all()}


async def process_import(bank_import_id: int, user_id: int, db: AsyncSession) -> int:
    """Process an uploaded file: parse, send to LLM, create staged transactions."""
    bank_import = await db.get(BankImport, bank_import_id)
    if not bank_import or bank_import.user_id != user_id:
        raise ValueError("Import not found")

    bank_import.status = "processing"
    await db.commit()

    try:
        file_path = Path("uploads") / bank_import.filename
        categories = await get_categories_for_llm(db, user_id)
        category_map = await get_category_map(db, user_id)
        few_shot = await category_learning.get_few_shot_examples(db, user_id)

        if bank_import.file_type == "csv":
            parsed_rows = await parser_service.parse_csv_async(file_path)

            # Apply learned rules first; only send unmatched rows to the LLM.
            applied: dict[int, dict] = {}
            unmatched_indices: list[int] = []
            for i, row in enumerate(parsed_rows):
                rule = await category_learning.lookup_rule(db, user_id, row.get("description", ""))
                if rule and rule.hit_count >= category_learning.AUTO_APPLY_THRESHOLD:
                    applied[i] = {
                        "category_id": rule.category_id,
                        "type": rule.type,
                        "cleaned_description": row.get("description", ""),
                        "confidence": 0.95,
                    }
                else:
                    unmatched_indices.append(i)

            llm_results: list[dict] = []
            if unmatched_indices:
                batch = [{"index": idx, **parsed_rows[idx]} for idx in unmatched_indices]
                llm_results = await llm_service.categorize_transactions(
                    batch, categories, learned_examples=few_shot
                )

            llm_by_index = {r.get("index", -1): r for r in llm_results}

            staged_count = 0
            for i, original_row in enumerate(parsed_rows):
                applied_row = applied.get(i)
                llm_row = llm_by_index.get(i, {}) if applied_row is None else {}
                raw_amount = _parse_amount(original_row["amount"])
                category_name = (applied_row or llm_row).get("category", "") if applied_row is None else None
                category_id = (
                    applied_row["category_id"] if applied_row else category_map.get(category_name, None)
                )
                ttype = (applied_row or llm_row).get("type", "expense")
                cleaned = (applied_row or llm_row).get(
                    "cleaned_description", original_row["description"]
                )
                confidence = (applied_row or llm_row).get("confidence", 0)

                staged = StagedTransaction(
                    bank_import_id=bank_import_id,
                    date=_parse_date(original_row["date"]),
                    description=cleaned,
                    amount=abs(raw_amount),
                    type=ttype,
                    category_id=category_id,
                    confidence=Decimal(str(confidence)),
                    original_text=original_row.get("original_text"),
                    accepted=True,
                )
                db.add(staged)
                staged_count += 1

            llm_results_count = staged_count

        elif bank_import.file_type == "pdf":
            try:
                pdf_markdown = await docling_service.pdf_to_markdown_async(file_path)
                logger.info(
                    "PDF %s convertido via Granite-Docling-258M (%d chars markdown)",
                    bank_import.filename,
                    len(pdf_markdown),
                )
            except Exception as exc:
                logger.warning(
                    "Granite-Docling falhou (%s); usando fallback pdfplumber.",
                    exc,
                )
                pdf_markdown = await parser_service.extract_pdf_text_async(file_path)

            llm_results = await llm_service.extract_and_categorize_pdf(
                pdf_markdown, categories, learned_examples=few_shot
            )

            for llm_row in llm_results:
                raw_amount = _parse_amount(str(llm_row.get("amount", 0)))
                description = llm_row.get("cleaned_description", llm_row.get("description", ""))

                # Override LLM category with learned rule when confident enough.
                rule = await category_learning.lookup_rule(db, user_id, description)
                if rule and rule.hit_count >= category_learning.AUTO_APPLY_THRESHOLD:
                    category_id = rule.category_id
                    ttype = rule.type
                    confidence = max(0.95, float(llm_row.get("confidence", 0) or 0))
                else:
                    category_id = category_map.get(llm_row.get("category", ""))
                    ttype = llm_row.get("type", "expense")
                    confidence = float(llm_row.get("confidence", 0) or 0)

                staged = StagedTransaction(
                    bank_import_id=bank_import_id,
                    date=_parse_date(llm_row.get("date", "")),
                    description=description,
                    amount=abs(raw_amount),
                    type=ttype,
                    category_id=category_id,
                    confidence=Decimal(str(confidence)),
                    original_text=llm_row.get("description"),
                    accepted=True,
                )
                db.add(staged)
            llm_results_count = len(llm_results)

        bank_import.row_count = llm_results_count
        bank_import.status = "review"
        await db.commit()
        return llm_results_count

    except Exception as e:
        bank_import.status = "failed"
        bank_import.error_message = str(e)
        await db.commit()
        raise


async def confirm_import(bank_import_id: int, user_id: int, db: AsyncSession) -> dict:
    """Move accepted staged transactions into the transactions table."""
    result = await db.execute(
        select(StagedTransaction).where(
            StagedTransaction.bank_import_id == bank_import_id,
            StagedTransaction.accepted == True,
        )
    )
    staged_rows = result.scalars().all()

    skipped_income = sum(1 for s in staged_rows if s.type == "income")
    rows_to_insert = [
        {
            "user_id": user_id,
            "date": s.date,
            "description": s.description,
            "amount": s.amount,
            "type": s.type,
            "category_id": s.category_id,
            "bank_import_id": bank_import_id,
        }
        for s in staged_rows
        if s.type != "income"
    ]

    if rows_to_insert:
        await db.execute(insert(Transaction), rows_to_insert)

    learn_rows = [
        (s.description, s.type, s.category_id) for s in staged_rows if s.category_id
    ]
    if learn_rows:
        await category_learning.learn_from_confirmed(db, user_id, learn_rows)

    bank_import = await db.get(BankImport, bank_import_id)
    bank_import.status = "completed"
    await db.commit()
    return {"created": len(rows_to_insert), "skipped_income": skipped_income}


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
