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
    is_recurring: bool = False
    recurring_day: Optional[int] = None
    icon: str = "receipt_long"


class TransactionUpdate(BaseModel):
    date: Optional[Date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurring_day: Optional[int] = None
    icon: Optional[str] = None


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
    is_recurring: bool = False
    recurring_day: Optional[int] = None
    icon: str = "receipt_long"
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


# --- Salary ---
class DiscountCreate(BaseModel):
    name: str
    type: str  # 'fixed' or 'percent'
    value: Decimal


class DiscountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    salary_config_id: int
    name: str
    type: str
    value: Decimal
    created_at: DateTime


class OvertimeEntryCreate(BaseModel):
    month: int
    year: int
    hours: Decimal
    rate_percent: int  # 70 or 100


class OvertimeEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    salary_config_id: int
    month: int
    year: int
    hours: Decimal
    rate_percent: int
    created_at: DateTime


class SalaryConfigCreate(BaseModel):
    base_salary: Decimal
    overtime_hour_rate: Decimal
    meal_allowance: Decimal = Decimal("0")
    health_plan_deduction: Decimal = Decimal("0")
    dental_plan_deduction: Decimal = Decimal("0")
    transport_voucher_enabled: bool = False
    transport_voucher_percent: Decimal = Decimal("6.00")
    fgts_balance: Decimal = Decimal("0")


class SalaryConfigUpdate(BaseModel):
    base_salary: Optional[Decimal] = None
    overtime_hour_rate: Optional[Decimal] = None
    meal_allowance: Optional[Decimal] = None
    health_plan_deduction: Optional[Decimal] = None
    dental_plan_deduction: Optional[Decimal] = None
    transport_voucher_enabled: Optional[bool] = None
    transport_voucher_percent: Optional[Decimal] = None
    fgts_balance: Optional[Decimal] = None


class SalaryConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    base_salary: Decimal
    overtime_hour_rate: Decimal
    meal_allowance: Decimal = Decimal("0")
    health_plan_deduction: Decimal = Decimal("0")
    dental_plan_deduction: Decimal = Decimal("0")
    transport_voucher_enabled: bool = False
    transport_voucher_percent: Decimal = Decimal("6.00")
    fgts_balance: Decimal = Decimal("0")
    discounts: list[DiscountOut]
    overtime_entries: list[OvertimeEntryOut]
    created_at: DateTime
    updated_at: DateTime


class SalaryCalculationOut(BaseModel):
    base_salary: Decimal
    overtime_total: Decimal
    overtime_details: list[dict]
    gross_salary: Decimal
    discounts_total: Decimal
    discount_details: list[dict]
    net_salary: Decimal


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


# --- Income ---
class IncomeCalculateRequest(BaseModel):
    reference_month: int
    reference_year: int
    overtime_hours: Decimal = Decimal("0")
    overtime_multiplier: Decimal = Decimal("0.30")  # 0.30, 0.50, 0.70
    monthly_bonus: Decimal = Decimal("0")
    discounts_absences: Decimal = Decimal("0")


class IncomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference_month: int
    reference_year: int
    base_salary: Decimal
    meal_allowance: Decimal
    health_plan_deduction: Decimal
    overtime_hours: Decimal
    overtime_multiplier: Decimal
    monthly_bonus: Decimal
    discounts_absences: Decimal
    overtime_value: Decimal
    inss: Decimal
    irrf: Decimal
    total_gross: Decimal
    total_deductions: Decimal
    net_salary: Decimal
    created_at: DateTime


class IncomeLaunchResponse(BaseModel):
    id: int
    reference_month: int
    reference_year: int
    base_salary: Decimal
    meal_allowance: Decimal
    health_plan_deduction: Decimal
    overtime_hours: Decimal
    overtime_multiplier: Decimal
    monthly_bonus: Decimal
    discounts_absences: Decimal
    overtime_value: Decimal
    inss: Decimal
    irrf: Decimal
    total_gross: Decimal
    total_deductions: Decimal
    net_salary: Decimal


# --- Dashboard Extensions ---
class ChartMonthOut(BaseModel):
    month_label: str
    total: Decimal


class CategoryProgressOut(BaseModel):
    name: str
    total: Decimal
    percentage: Decimal


class TransactionGroupedOut(BaseModel):
    one_time: list[TransactionOut]
    recurring: list[TransactionOut]


# --- Monthly Entries (overtime / refund / late / absence launches) ---
class MonthlyEntryCreate(BaseModel):
    reference_month: int
    reference_year: int
    entry_type: str  # 'overtime' | 'refund' | 'late' | 'absence'
    entry_date: Optional[Date] = None  # defaults to today server-side
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    hours: Optional[Decimal] = None
    overtime_multiplier: Optional[Decimal] = None
    days: Optional[int] = None


class MonthlyEntryUpdate(BaseModel):
    entry_date: Optional[Date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    hours: Optional[Decimal] = None
    overtime_multiplier: Optional[Decimal] = None
    days: Optional[int] = None


class MonthlyEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference_month: int
    reference_year: int
    entry_type: str
    entry_date: Date
    description: Optional[str]
    amount: Optional[Decimal]
    hours: Optional[Decimal]
    overtime_multiplier: Optional[Decimal]
    days: Optional[int]
    created_at: DateTime


class MonthlySummaryOut(BaseModel):
    reference_month: int
    reference_year: int
    base_salary: Decimal
    meal_allowance: Decimal
    overtime_hours_total: Decimal
    overtime_value: Decimal
    refunds_total: Decimal
    late_hours_total: Decimal
    late_value: Decimal
    absence_days_total: int
    absence_value: Decimal
    discounts_absences_value: Decimal
    health_plan_deduction: Decimal
    dental_plan_deduction: Decimal
    transport_voucher_value: Decimal
    inss: Decimal
    irrf: Decimal
    total_gross: Decimal
    total_deductions: Decimal
    net_salary: Decimal
    fgts_balance: Decimal
