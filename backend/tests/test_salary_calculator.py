from decimal import Decimal

from app.services.salary_calculator import calculate_inss, calculate_irrf, calculate_net_salary


def test_calculate_irrf_returns_zero_for_exempt_bracket():
    assert calculate_irrf(Decimal("2259.20")) == Decimal("0.00")


def test_calculate_inss_applies_progressive_brackets_with_rounding():
    assert calculate_inss(Decimal("3000.00")) == Decimal("258.82")


def test_calculate_irrf_uses_correct_bracket_and_rounding():
    assert calculate_irrf(Decimal("3000.00")) == Decimal("68.56")


def test_calculate_net_salary_excludes_meal_allowance_from_tax_bases():
    result = calculate_net_salary(
        base_salary=Decimal("5000.00"),
        meal_allowance=Decimal("600.00"),
        health_plan_deduction=Decimal("150.00"),
        overtime_hours=Decimal("10"),
        overtime_multiplier=Decimal("0.50"),
        monthly_bonus=Decimal("500.00"),
        discounts_absences=Decimal("100.00"),
    )

    assert result["overtime_value"] == Decimal("340.91")
    assert result["inss"] == Decimal("636.55")
    assert result["irrf"] == Decimal("535.20")
    assert result["total_gross"] == Decimal("6440.91")
    assert result["total_deductions"] == Decimal("1421.75")
    assert result["net_salary"] == Decimal("5019.16")


def test_calculate_net_salary_supports_common_overtime_multipliers():
    base_args = {
        "base_salary": Decimal("2200.00"),
        "meal_allowance": Decimal("0"),
        "health_plan_deduction": Decimal("0"),
        "overtime_hours": Decimal("10"),
        "monthly_bonus": Decimal("0"),
        "discounts_absences": Decimal("0"),
    }

    result_30 = calculate_net_salary(**base_args, overtime_multiplier=Decimal("0.30"))
    result_50 = calculate_net_salary(**base_args, overtime_multiplier=Decimal("0.50"))
    result_70 = calculate_net_salary(**base_args, overtime_multiplier=Decimal("0.70"))

    assert result_30["overtime_value"] == Decimal("130.00")
    assert result_50["overtime_value"] == Decimal("150.00")
    assert result_70["overtime_value"] == Decimal("170.00")
    assert result_30["net_salary"] < result_50["net_salary"] < result_70["net_salary"]
