from decimal import Decimal

from app.services.salary_calculator import (
    calculate_inss,
    calculate_irrf,
    calculate_net_salary,
)


def test_calculate_inss_uses_2026_brackets():
    assert calculate_inss(Decimal("5347.60"), 2026) == Decimal("550.18")


def test_calculate_irrf_applies_2026_simplified_monthly_deduction():
    assert calculate_irrf(Decimal("4726.93"), 2026, 3) == Decimal("251.45")


def test_calculate_net_salary_passes_reference_period_rules():
    # Renda mensal bruta R$ 3.528,22 está abaixo do teto de isenção da reforma 2026
    # (R$ 5.000), portanto o IRRF deve ser zerado.
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
    assert result["irrf"] == Decimal("0.00")


def test_calculate_irrf_reform_2026_full_exemption_under_threshold():
    # Renda mensal bruta abaixo de R$ 5.000 → isenção total.
    irrf = calculate_irrf(
        Decimal("4500.00"),
        2026,
        3,
        monthly_gross=Decimal("4900.00"),
    )
    assert irrf == Decimal("0.00")


def test_calculate_irrf_reform_2026_linear_redutor_in_transition_band():
    # Renda na faixa de transição (R$ 5.000 - R$ 7.350) recebe redutor linear.
    base_after_inss = Decimal("6000.00")
    monthly_gross = Decimal("6500.00")
    irrf_no_reform = calculate_irrf(base_after_inss, 2026, 3)
    irrf_with_reform = calculate_irrf(base_after_inss, 2026, 3, monthly_gross=monthly_gross)
    # O redutor reduz proporcionalmente o IRRF apurado pela tabela.
    assert irrf_with_reform > Decimal("0.00")
    assert irrf_with_reform < irrf_no_reform


def test_calculate_irrf_reform_2026_above_threshold_uses_full_table():
    # Renda acima de R$ 7.350 não recebe nenhum benefício da reforma.
    base_after_inss = Decimal("8000.00")
    monthly_gross = Decimal("9000.00")
    irrf_no_reform = calculate_irrf(base_after_inss, 2026, 3)
    irrf_with_reform = calculate_irrf(base_after_inss, 2026, 3, monthly_gross=monthly_gross)
    assert irrf_with_reform == irrf_no_reform
