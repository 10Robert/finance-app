import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import BankImport, StagedTransaction
from app.schemas import BankImportOut, StagedTransactionOut, StagedBatchUpdate
from app.services import import_service

router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.get("/", response_model=list[BankImportOut])
async def list_imports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BankImport).order_by(BankImport.created_at.desc()))
    return result.scalars().all()


@router.post("/upload", response_model=BankImportOut, status_code=201)
async def upload_file(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "pdf"):
        raise HTTPException(400, "Only CSV and PDF files are supported")

    # Save file
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    bank_import = BankImport(filename=file.filename, file_type=ext, status="pending")
    db.add(bank_import)
    await db.commit()
    await db.refresh(bank_import)
    return bank_import


@router.post("/{import_id}/process")
async def process_import(import_id: int, db: AsyncSession = Depends(get_db)):
    try:
        count = await import_service.process_import(import_id, db)
        return {"message": f"Processed {count} transactions", "count": count}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Processing failed: {str(e)}")


@router.get("/{import_id}/staged", response_model=list[StagedTransactionOut])
async def get_staged(import_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StagedTransaction)
        .options(selectinload(StagedTransaction.category))
        .where(StagedTransaction.bank_import_id == import_id)
        .order_by(StagedTransaction.date, StagedTransaction.id)
    )
    return result.scalars().all()


@router.put("/{import_id}/staged")
async def update_staged(import_id: int, data: StagedBatchUpdate, db: AsyncSession = Depends(get_db)):
    for update in data.updates:
        staged_id = update.get("id")
        if not staged_id:
            continue
        staged = await db.get(StagedTransaction, staged_id)
        if not staged or staged.bank_import_id != import_id:
            continue
        if "category_id" in update:
            staged.category_id = update["category_id"]
        if "accepted" in update:
            staged.accepted = update["accepted"]
    await db.commit()
    return {"message": "Updated"}


@router.post("/{import_id}/confirm")
async def confirm_import(import_id: int, db: AsyncSession = Depends(get_db)):
    try:
        result = await import_service.confirm_import(import_id, db)
        return {
            "message": f"Confirmed {result['created']} transactions",
            "created": result["created"],
            "skipped_income": result["skipped_income"],
        }
    except Exception as e:
        raise HTTPException(500, f"Confirmation failed: {str(e)}")
