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
    source: Optional[str] = None
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


# --- Expenses Chart (stacked bar) ---
class ExpensesChartBar(BaseModel):
    label: str
    income: Decimal
    expenses: Decimal
    net: Decimal
    accumulated: Decimal


class ExpensesChartOut(BaseModel):
    mode: str  # "annual", "monthly", "weekly"
    bars: list[ExpensesChartBar]
    total_expenses: Decimal
    monthly_average: Decimal
    highest_label: str  # label of the bar with highest expense


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
    reference_month: Optional[int] = None
    reference_year: Optional[int] = None
    coparticipation: Decimal = Decimal("0")


class SalaryConfigUpdate(BaseModel):
    base_salary: Optional[Decimal] = None
    overtime_hour_rate: Optional[Decimal] = None
    meal_allowance: Optional[Decimal] = None
    health_plan_deduction: Optional[Decimal] = None
    dental_plan_deduction: Optional[Decimal] = None
    transport_voucher_enabled: Optional[bool] = None
    transport_voucher_percent: Optional[Decimal] = None
    fgts_balance: Optional[Decimal] = None
    coparticipation: Optional[Decimal] = None


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
    reference_month: Optional[int] = None
    reference_year: Optional[int] = None
    coparticipation: Decimal = Decimal("0")
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
    dsr_value: Decimal = Decimal("0")
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
    dsr_value: Decimal = Decimal("0")
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


# --- Fixed Expenses ---
class FixedExpenseCreate(BaseModel):
    description: str
    amount: Decimal
    category_id: Optional[int] = None
    day_of_month: int = 1
    is_permanent: bool = True
    start_date: Date
    end_date: Optional[Date] = None
    icon: str = "repeat"


class FixedExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str
    amount: Decimal
    category_id: Optional[int]
    category: Optional[CategoryOut]
    day_of_month: int
    is_permanent: bool
    start_date: Date
    end_date: Optional[Date]
    active: bool
    icon: str
    created_at: DateTime


# --- Installment Purchases ---
class InstallmentPurchaseCreate(BaseModel):
    description: str
    total_amount: Decimal
    installment_count: int
    category_id: Optional[int] = None
    start_date: Date
    icon: str = "credit_card"


class InstallmentPurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str
    total_amount: Decimal
    installment_count: int
    category_id: Optional[int]
    category: Optional[CategoryOut]
    start_date: Date
    icon: str
    created_at: DateTime


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


# --- Credit Cards ---
class CreditCardCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    color: str = "#a78bfa"
    credit_limit: Decimal = Decimal("0")
    closing_day: int  # 1-31
    due_day: int  # 1-31


class CreditCardUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    color: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    closing_day: Optional[int] = None
    due_day: Optional[int] = None
    active: Optional[bool] = None


class CreditCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    brand: Optional[str]
    color: str
    credit_limit: Decimal
    closing_day: int
    due_day: int
    active: bool
    used_amount: Decimal = Decimal("0")  # populated by router
    created_at: DateTime


class CreditCardInstallmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    expense_id: int
    credit_card_id: int
    installment_number: int
    amount: Decimal
    bill_month: int
    bill_year: int
    original_bill_month: int
    original_bill_year: int
    created_at: DateTime


class CreditCardExpenseCreate(BaseModel):
    credit_card_id: int
    category_id: Optional[int] = None
    description: str
    amount: Decimal
    purchase_date: Date
    installment_count: int = 1
    is_subscription: bool = False
    notes: Optional[str] = None
    icon: str = "credit_card"


class CreditCardExpenseUpdate(BaseModel):
    credit_card_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    purchase_date: Optional[Date] = None
    installment_count: Optional[int] = None
    is_subscription: Optional[bool] = None
    notes: Optional[str] = None
    icon: Optional[str] = None


class CreditCardExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    credit_card_id: int
    category_id: Optional[int]
    category: Optional[CategoryOut]
    description: str
    amount: Decimal
    purchase_date: Date
    installment_count: int
    is_subscription: bool
    is_refunded: bool
    refunded_at: Optional[Date]
    notes: Optional[str]
    icon: str
    installments: list[CreditCardInstallmentOut] = []
    created_at: DateTime
    updated_at: DateTime


class CreditCardBillItemOut(BaseModel):
    """An installment as it appears on a fatura — flattened with parent expense info."""
    installment_id: int
    expense_id: int
    credit_card_id: int
    card_name: str
    card_color: str
    description: str
    category_id: Optional[int]
    category_name: Optional[str]
    category_icon: Optional[str]
    icon: str
    installment_number: int
    installment_count: int
    amount: Decimal
    purchase_date: Date
    is_subscription: bool
    is_refunded: bool
    is_anticipated: bool  # bill_month != original_bill_month
    bill_month: int
    bill_year: int


class CreditCardMonthSummaryOut(BaseModel):
    bill_month: int
    bill_year: int
    label: str  # "Janeiro 2026"
    total: Decimal  # excludes refunded
    refunded_total: Decimal
    item_count: int
    installment_total: Decimal = Decimal("0")  # parcelas (installment_count > 1)
    subscription_total: Decimal = Decimal("0")  # assinaturas
    one_time_total: Decimal = Decimal("0")  # avulsos


class AnticipateInstallmentRequest(BaseModel):
    target_month: int  # 1-12
    target_year: int


class CreditCardDailySpendOut(BaseModel):
    day: int
    total: Decimal


class CreditCardImportPdfPreviewItem(BaseModel):
    """A single transaction extracted from a PDF for review."""
    purchase_date: Date
    description: str
    amount: Decimal
    suggested_category_id: Optional[int] = None
    suggested_category_name: Optional[str] = None


class CreditCardBulkCreateItem(BaseModel):
    description: str
    amount: Decimal
    purchase_date: Date
    category_id: Optional[int] = None
    installment_count: int = 1


class CreditCardBulkCreate(BaseModel):
    credit_card_id: int
    items: list[CreditCardBulkCreateItem]


class MonthlySummaryOut(BaseModel):
    reference_month: int
    reference_year: int
    base_salary: Decimal
    meal_allowance: Decimal
    overtime_hours_total: Decimal
    overtime_value: Decimal
    dsr_value: Decimal = Decimal("0")
    refunds_total: Decimal
    late_hours_total: Decimal
    late_value: Decimal
    absence_days_total: int
    absence_value: Decimal
    discounts_absences_value: Decimal
    health_plan_deduction: Decimal
    dental_plan_deduction: Decimal
    transport_voucher_value: Decimal
    coparticipation: Decimal = Decimal("0")
    medical_certificate_days: int = 0
    inss: Decimal
    irrf: Decimal
    total_gross: Decimal
    total_deductions: Decimal
    net_salary: Decimal
    fgts_balance: Decimal
