from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")

# INSS Progressive Brackets (2026) — teto R$ 8.475,55
INSS_BRACKETS = [
    (Decimal("1621.00"), Decimal("0.075")),
    (Decimal("2902.84"), Decimal("0.09")),
    (Decimal("4354.27"), Decimal("0.12")),
    (Decimal("8475.55"), Decimal("0.14")),
]

# IRRF Simplified Brackets (2026) - applied after INSS deduction
IRRF_BRACKETS = [
    (Decimal("2259.20"), Decimal("0"), Decimal("0")),
    (Decimal("2826.65"), Decimal("0.075"), Decimal("169.44")),
    (Decimal("3751.05"), Decimal("0.15"), Decimal("381.44")),
    (Decimal("4664.68"), Decimal("0.225"), Decimal("662.77")),
    (Decimal("999999999"), Decimal("0.275"), Decimal("896.00")),
]


def calculate_inss(base: Decimal) -> Decimal:
    total = Decimal("0")
    prev_limit = Decimal("0")
    for limit, rate in INSS_BRACKETS:
        if base <= prev_limit:
            break
        taxable = min(base, limit) - prev_limit
        total += taxable * rate
        prev_limit = limit
    return total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_irrf(base_after_inss: Decimal) -> Decimal:
    for limit, rate, deduction in IRRF_BRACKETS:
        if base_after_inss <= limit:
            irrf = (base_after_inss * rate - deduction)
            return max(irrf, Decimal("0")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return Decimal("0")


def calculate_net_salary(
    base_salary: Decimal,
    meal_allowance: Decimal,
    health_plan_deduction: Decimal,
    overtime_hours: Decimal,
    overtime_multiplier: Decimal,
    monthly_bonus: Decimal,
    discounts_absences: Decimal,
) -> dict:
    # Overtime value
    hourly_rate = base_salary / Decimal("220")
    overtime_value = (overtime_hours * hourly_rate * (Decimal("1") + overtime_multiplier)).quantize(TWO_PLACES)

    # Gross salary
    total_gross = (base_salary + meal_allowance + overtime_value + monthly_bonus).quantize(TWO_PLACES)

    # INSS base: salary + overtime + bonus (meal allowance excluded per Brazilian law)
    inss_base = base_salary + overtime_value + monthly_bonus
    inss = calculate_inss(inss_base)

    # IRRF base: inss_base minus inss
    irrf_base = inss_base - inss
    irrf = calculate_irrf(irrf_base)

    # Total deductions
    total_deductions = (health_plan_deduction + inss + irrf + discounts_absences).quantize(TWO_PLACES)

    # Net salary
    net_salary = (total_gross - total_deductions).quantize(TWO_PLACES)

    return {
        "base_salary": base_salary,
        "meal_allowance": meal_allowance,
        "health_plan_deduction": health_plan_deduction,
        "overtime_hours": overtime_hours,
        "overtime_multiplier": overtime_multiplier,
        "monthly_bonus": monthly_bonus,
        "discounts_absences": discounts_absences,
        "overtime_value": overtime_value,
        "inss": inss,
        "irrf": irrf,
        "total_gross": total_gross,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
    }
