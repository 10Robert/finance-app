from datetime import date as Date, datetime as DateTime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


# --- Category ---
class CategoryCreate(BaseModel):
    name: str
    type: str  # 'expense' or 'income'
    icon: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    icon: Optional[str] = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    icon: Optional[str]
    created_at: DateTime


# --- Transaction ---
class TransactionCreate(BaseModel):
    date: Date
    description: str
    amount: Decimal
    type: str  # 'expense' or 'income'
    category_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[Date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: Date
    description: str
    amount: Decimal
    type: str
    category_id: Optional[int]
    category: Optional[CategoryOut]
    notes: Optional[str]
    bank_import_id: Optional[int]
    created_at: DateTime
    updated_at: DateTime


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    per_page: int


# --- Bank Import ---
class BankImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    file_type: str
    row_count: Optional[int]
    status: str
    error_message: Optional[str]
    created_at: DateTime


# --- Staged Transaction ---
class StagedTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bank_import_id: int
    date: Date
    description: str
    amount: Decimal
    type: str
    category_id: Optional[int]
    category: Optional[CategoryOut]
    confidence: Optional[Decimal]
    original_text: Optional[str]
    accepted: bool


class StagedTransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    accepted: Optional[bool] = None


class StagedBatchUpdate(BaseModel):
    updates: list[dict]  # [{"id": 1, "category_id": 2, "accepted": true}, ...]


# --- Dashboard ---
class DashboardSummary(BaseModel):
    total_income: Decimal
    total_expenses: Decimal
    net: Decimal
    transaction_count: int


class BalanceOut(BaseModel):
    balance: Decimal
    income_total: Decimal
    expense_total: Decimal
    variation_percent: Optional[Decimal]  # % change vs previous period


class MonthlyRevenueOut(BaseModel):
    revenue: Decimal
    goal: Optional[Decimal]
    goal_percent: Optional[Decimal]


class SpendingFlowPoint(BaseModel):
    label: str  # "01 Jun", "Fev", etc.
    amount: Decimal


class SpendingFlowOut(BaseModel):
    period: str  # "monthly" or "annual"
    points: list[SpendingFlowPoint]


class SpendingByCategory(BaseModel):
    category_name: str
    category_icon: Optional[str]
    total: Decimal
    color: Optional[str]


class MonthlyTrend(BaseModel):
    month: str  # "2026-01"
    income: Decimal
    expenses: Decimal
    net: Decimal


class RecentTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: Date
    description: str
    amount: Decimal
    type: str
    category_name: Optional[str]
    category_icon: Optional[str]
    icon: str  # material icon name
