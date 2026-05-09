from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import String, Numeric, Date, Boolean, Text, Integer, ForeignKey, Index, UniqueConstraint, func
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
        Index("idx_transactions_date_type", "date", "type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    type: Mapped[str] = mapped_column(String(10))  # 'expense' or 'income'
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    bank_import_id: Mapped[int | None] = mapped_column(ForeignKey("bank_imports.id", ondelete="SET NULL"))
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    recurring_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    icon: Mapped[str] = mapped_column(String(50), default="receipt_long", server_default="receipt_long")
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    category: Mapped[Category | None] = relationship(back_populates="transactions")
    bank_import: Mapped[BankImport | None] = relationship(back_populates="transactions")


class SalaryConfig(Base):
    __tablename__ = "salary_configs"
    __table_args__ = (
        UniqueConstraint("reference_month", "reference_year", name="uq_salary_config_month_year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    overtime_hour_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    meal_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    health_plan_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    dental_plan_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    transport_voucher_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    transport_voucher_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("6.00"), server_default="6.00")
    fgts_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    coparticipation: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    discounts: Mapped[list["Discount"]] = relationship(back_populates="salary_config", cascade="all, delete-orphan")
    overtime_entries: Mapped[list["OvertimeEntry"]] = relationship(back_populates="salary_config", cascade="all, delete-orphan")


class MonthlyEntry(Base):
    """A single launch within a reference month: overtime, refund, late-hours or absence."""
    __tablename__ = "monthly_entries"
    __table_args__ = (
        Index("idx_monthly_entries_period", "reference_year", "reference_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_month: Mapped[int] = mapped_column(Integer)  # 1-12
    reference_year: Mapped[int] = mapped_column(Integer)
    entry_type: Mapped[str] = mapped_column(String(20))  # 'overtime' | 'refund' | 'late' | 'absence'
    entry_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # refunds: BRL value
    hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))  # overtime/late: hours
    overtime_multiplier: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))  # overtime: 0.30/0.70/1.00
    days: Mapped[int | None] = mapped_column(Integer)  # absence: missed days
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Discount(Base):
    __tablename__ = "discounts"
    __table_args__ = (
        Index("idx_discounts_salary_config", "salary_config_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    salary_config_id: Mapped[int] = mapped_column(ForeignKey("salary_configs.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(10))  # 'fixed' or 'percent'
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    salary_config: Mapped["SalaryConfig"] = relationship(back_populates="discounts")


class OvertimeEntry(Base):
    __tablename__ = "overtime_entries"
    __table_args__ = (
        Index("idx_overtime_config_period", "salary_config_id", "month", "year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    salary_config_id: Mapped[int] = mapped_column(ForeignKey("salary_configs.id", ondelete="CASCADE"))
    month: Mapped[int] = mapped_column()  # 1-12
    year: Mapped[int] = mapped_column()
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    rate_percent: Mapped[int] = mapped_column()  # 70 or 100
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    salary_config: Mapped["SalaryConfig"] = relationship(back_populates="overtime_entries")


class FixedExpense(Base):
    """A recurring monthly expense: either permanent or with an end date."""
    __tablename__ = "fixed_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    is_permanent: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    start_date: Mapped[date] = mapped_column(Date)  # first month (YYYY-MM-01)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # null = permanent
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    icon: Mapped[str] = mapped_column(String(50), default="repeat", server_default="repeat")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    category: Mapped[Category | None] = relationship()


class InstallmentPurchase(Base):
    """A product bought in installments: total value split across N months."""
    __tablename__ = "installment_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(String(500))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    installment_count: Mapped[int] = mapped_column(Integer)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    start_date: Mapped[date] = mapped_column(Date)  # first installment month
    icon: Mapped[str] = mapped_column(String(50), default="credit_card", server_default="credit_card")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    category: Mapped[Category | None] = relationship()


class StagedTransaction(Base):
    __tablename__ = "staged_transactions"
    __table_args__ = (
        Index("idx_staged_import_accepted", "bank_import_id", "accepted"),
    )

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


class CreditCard(Base):
    __tablename__ = "credit_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    brand: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#a78bfa", server_default="#a78bfa")
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    closing_day: Mapped[int] = mapped_column(Integer)  # dia do fechamento da fatura (1-31)
    due_day: Mapped[int] = mapped_column(Integer)  # dia do vencimento (1-31)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    expenses: Mapped[list["CreditCardExpense"]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )


class CreditCardExpense(Base):
    """A credit card purchase. Splits into N CreditCardInstallment rows."""
    __tablename__ = "credit_card_expenses"
    __table_args__ = (
        Index("idx_cc_expenses_card", "credit_card_id"),
        Index("idx_cc_expenses_date", "purchase_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    credit_card_id: Mapped[int] = mapped_column(ForeignKey("credit_cards.id", ondelete="CASCADE"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # total amount
    purchase_date: Mapped[date] = mapped_column(Date)
    installment_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    is_subscription: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_refunded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    refunded_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(50), default="credit_card", server_default="credit_card")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    card: Mapped["CreditCard"] = relationship(back_populates="expenses")
    category: Mapped[Category | None] = relationship()
    installments: Mapped[list["CreditCardInstallment"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )


class CreditCardInstallment(Base):
    """One row per parcela of a CreditCardExpense (or per month for subscriptions)."""
    __tablename__ = "credit_card_installments"
    __table_args__ = (
        Index("idx_cc_inst_period", "bill_year", "bill_month"),
        Index("idx_cc_inst_card", "credit_card_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("credit_card_expenses.id", ondelete="CASCADE"))
    credit_card_id: Mapped[int] = mapped_column(ForeignKey("credit_cards.id", ondelete="CASCADE"))
    installment_number: Mapped[int] = mapped_column(Integer)  # 1..N (or month index for subscription)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    bill_month: Mapped[int] = mapped_column(Integer)  # current bill month (1-12)
    bill_year: Mapped[int] = mapped_column(Integer)
    original_bill_month: Mapped[int] = mapped_column(Integer)  # for tracking antecipação
    original_bill_year: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    expense: Mapped["CreditCardExpense"] = relationship(back_populates="installments")


class CategoryRule(Base):
    """Learned rule mapping a normalized description pattern to a category.

    Built up automatically when the user confirms imported transactions: if
    the same (normalized) description repeatedly maps to the same category,
    we apply the rule directly on future imports (skipping the LLM) and
    inject high-hit rules as few-shot examples into the LLM prompt.
    """
    __tablename__ = "category_rules"
    __table_args__ = (
        UniqueConstraint("pattern", "type", name="uq_category_rule_pattern_type"),
        Index("idx_category_rules_pattern", "pattern"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(200))  # normalized description
    type: Mapped[str] = mapped_column(String(10))  # 'expense' | 'income'
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    hit_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    last_used_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    category: Mapped[Category] = relationship()


class Income(Base):
    __tablename__ = "incomes"
    __table_args__ = (
        UniqueConstraint("reference_month", "reference_year", name="uq_income_month_year"),
        Index("idx_income_period", "reference_year", "reference_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_month: Mapped[int] = mapped_column(Integer)  # 1-12
    reference_year: Mapped[int] = mapped_column(Integer)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    meal_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    health_plan_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    overtime_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("0.30"))
    monthly_bonus: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discounts_absences: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    overtime_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    dsr_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    inss: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    irrf: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    net_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
