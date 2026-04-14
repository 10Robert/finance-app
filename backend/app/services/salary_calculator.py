from decimal import Decimal, ROUND_HALF_UP
from typing import TypedDict

TWO_PLACES = Decimal("0.01")


class SalaryCalcResult(TypedDict):
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


def money(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


INSS_RULES = {
    2024: (
        (Decimal("1412.00"), Decimal("0.075")),
        (Decimal("2666.68"), Decimal("0.09")),
        (Decimal("4000.03"), Decimal("0.12")),
        (Decimal("7786.02"), Decimal("0.14")),
    ),
    2025: (
        (Decimal("1518.00"), Decimal("0.075")),
        (Decimal("2793.88"), Decimal("0.09")),
        (Decimal("4190.83"), Decimal("0.12")),
        (Decimal("8157.41"), Decimal("0.14")),
    ),
    2026: (
        (Decimal("1621.00"), Decimal("0.075")),
        (Decimal("2902.84"), Decimal("0.09")),
        (Decimal("4354.27"), Decimal("0.12")),
        (Decimal("8475.55"), Decimal("0.14")),
    ),
}

IRRF_RULES = {
    (2024, None): {
        "monthly_simplified_deduction": Decimal("564.80"),
        "brackets": (
            (Decimal("2259.20"), Decimal("0"), Decimal("0")),
            (Decimal("2826.65"), Decimal("0.075"), Decimal("169.44")),
            (Decimal("3751.05"), Decimal("0.15"), Decimal("381.44")),
            (Decimal("4664.68"), Decimal("0.225"), Decimal("662.77")),
            (Decimal("999999999"), Decimal("0.275"), Decimal("896.00")),
        ),
    },
    (2025, 4): {
        "monthly_simplified_deduction": Decimal("564.80"),
        "brackets": (
            (Decimal("2259.20"), Decimal("0"), Decimal("0")),
            (Decimal("2826.65"), Decimal("0.075"), Decimal("169.44")),
            (Decimal("3751.05"), Decimal("0.15"), Decimal("381.44")),
            (Decimal("4664.68"), Decimal("0.225"), Decimal("662.77")),
            (Decimal("999999999"), Decimal("0.275"), Decimal("896.00")),
        ),
    },
    (2025, None): {
        "monthly_simplified_deduction": Decimal("607.20"),
        "brackets": (
            (Decimal("2428.80"), Decimal("0"), Decimal("0")),
            (Decimal("2826.65"), Decimal("0.075"), Decimal("182.16")),
            (Decimal("3751.05"), Decimal("0.15"), Decimal("394.16")),
            (Decimal("4664.68"), Decimal("0.225"), Decimal("675.49")),
            (Decimal("999999999"), Decimal("0.275"), Decimal("908.73")),
        ),
    },
    (2026, None): {
        "monthly_simplified_deduction": Decimal("607.20"),
        "brackets": (
            (Decimal("2428.80"), Decimal("0"), Decimal("0")),
            (Decimal("2826.65"), Decimal("0.075"), Decimal("182.16")),
            (Decimal("3751.05"), Decimal("0.15"), Decimal("394.16")),
            (Decimal("4664.68"), Decimal("0.225"), Decimal("675.49")),
            (Decimal("999999999"), Decimal("0.275"), Decimal("908.73")),
        ),
    },
}


def _resolve_inss_brackets(reference_year: int) -> tuple[tuple[Decimal, Decimal], ...]:
    try:
        return INSS_RULES[reference_year]
    except KeyError as exc:
        raise ValueError(f"No INSS rules configured for {reference_year}") from exc


def _resolve_irrf_rule(reference_year: int, reference_month: int | None) -> dict:
    if reference_year == 2024:
        return IRRF_RULES[(2024, None)]
    if reference_year == 2025 and reference_month is not None and reference_month <= 4:
        return IRRF_RULES[(2025, 4)]
    try:
        return IRRF_RULES[(reference_year, None)]
    except KeyError as exc:
        raise ValueError(f"No IRRF rules configured for {reference_year}") from exc


def calculate_inss(base: Decimal, reference_year: int) -> Decimal:
    total = Decimal("0")
    prev_limit = Decimal("0")
    for limit, rate in _resolve_inss_brackets(reference_year):
        if base <= prev_limit:
            break
        taxable = min(base, limit) - prev_limit
        total += taxable * rate
        prev_limit = limit
    return money(total)


def calculate_irrf(base_after_inss: Decimal, reference_year: int, reference_month: int | None = None) -> Decimal:
    rule = _resolve_irrf_rule(reference_year, reference_month)
    taxable_base = max(base_after_inss - rule["monthly_simplified_deduction"], Decimal("0"))
    for limit, rate, deduction in rule["brackets"]:
        if taxable_base <= limit:
            return money(max(taxable_base * rate - deduction, Decimal("0")))
    return Decimal("0.00")


def calculate_net_salary(
    base_salary: Decimal,
    meal_allowance: Decimal,
    health_plan_deduction: Decimal,
    overtime_hours: Decimal,
    overtime_multiplier: Decimal,
    monthly_bonus: Decimal,
    discounts_absences: Decimal,
    reference_year: int,
    reference_month: int | None = None,
) -> SalaryCalcResult:
    hourly_rate = base_salary / Decimal("220")
    overtime_value = money(overtime_hours * hourly_rate * (Decimal("1") + overtime_multiplier))

    total_gross = money(base_salary + meal_allowance + overtime_value + monthly_bonus)
    inss_base = base_salary + overtime_value + monthly_bonus
    inss = calculate_inss(inss_base, reference_year)
    irrf_base = inss_base - inss
    irrf = calculate_irrf(irrf_base, reference_year, reference_month)
    total_deductions = money(health_plan_deduction + inss + irrf + discounts_absences)
    net_salary = money(total_gross - total_deductions)

    return {
        "base_salary": money(base_salary),
        "meal_allowance": money(meal_allowance),
        "health_plan_deduction": money(health_plan_deduction),
        "overtime_hours": overtime_hours,
        "overtime_multiplier": overtime_multiplier,
        "monthly_bonus": money(monthly_bonus),
        "discounts_absences": money(discounts_absences),
        "overtime_value": overtime_value,
        "inss": inss,
        "irrf": irrf,
        "total_gross": total_gross,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
    }
