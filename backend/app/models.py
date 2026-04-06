from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import String, Numeric, Date, Boolean, Text, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(10))  # 'expense' or 'income'
    icon: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")
    staged_transactions: Mapped[list["StagedTransaction"]] = relationship(back_populates="category")


class BankImport(Base):
    __tablename__ = "bank_imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(10))  # 'csv' or 'pdf'
    row_count: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="bank_import")
    staged_transactions: Mapped[list["StagedTransaction"]] = relationship(
        back_populates="bank_import", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("idx_transactions_date", "date"),
        Index("idx_transactions_category", "category_id"),
        Index("idx_transactions_type", "type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    type: Mapped[str] = mapped_column(String(10))  # 'expense' or 'income'
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    bank_import_id: Mapped[int | None] = mapped_column(ForeignKey("bank_imports.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    category: Mapped[Category | None] = relationship(back_populates="transactions")
    bank_import: Mapped[BankImport | None] = relationship(back_populates="transactions")


class StagedTransaction(Base):
    __tablename__ = "staged_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_import_id: Mapped[int] = mapped_column(ForeignKey("bank_imports.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    type: Mapped[str] = mapped_column(String(10))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    original_text: Mapped[str | None] = mapped_column(Text)
    accepted: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    bank_import: Mapped[BankImport] = relationship(back_populates="staged_transactions")
    category: Mapped[Category | None] = relationship(back_populates="staged_transactions")
