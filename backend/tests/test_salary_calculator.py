from decimal import Decimal

from app.services.salary_calculator import calculate_inss, calculate_irrf, calculate_net_salary


def test_calculate_inss_uses_2026_brackets():
    assert calculate_inss(Decimal("5347.60"), 2026) == Decimal("550.18")


def test_calculate_irrf_applies_2026_simplified_monthly_deduction():
    assert calculate_irrf(Decimal("4726.93"), 2026, 3) == Decimal("251.45")


def test_calculate_net_salary_passes_reference_period_rules():
    result = calculate_net_salary(
        base_salary=Decimal("3528.22"),
        meal_allowance=Decimal("0"),
        health_plan_deduction=Decimal("0"),
        overtime_hours=Decimal("0"),
        overtime_multiplier=Decimal("0"),
        monthly_bonus=Decimal("0"),
        discounts_absences=Decimal("0"),
        reference_year=2026,
        reference_month=3,
    )

    assert result["inss"] == Decimal("311.99")
    assert result["irrf"] == Decimal("13.52")
