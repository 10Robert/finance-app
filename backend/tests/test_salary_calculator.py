from datetime import date
from decimal import Decimal

from app.services.salary_calculator import (
    brazilian_national_holidays,
    calculate_dsr_on_overtime,
    calculate_inss,
    calculate_irrf,
    calculate_net_salary,
    count_rest_and_working_days,
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
    # Renda na faixa de transição (R$ 5.000 - R$ 7.350) recebe redutor.
    # Renda 6500 está bem dentro da faixa.
    monthly_gross = Decimal("6500.00")
    inss = Decimal("711.51")  # INSS aproximado sobre 6500
    base = monthly_gross - inss

    irrf_with_reform = calculate_irrf(
        base, 2026, 3, monthly_gross=monthly_gross, inss=inss,
    )
    # Sem o redutor, o IRRF seria maior. Verificamos que o redutor está reduzindo.
    # Redutor = 978.62 - 0.133145 × 6500 = 113.18
    # IRRF cheio (simplificado): (6500 - 607.20) × 0.275 - 908.73 = 711.79
    # IRRF cheio (trad): (6500 - 711.51) × 0.275 - 908.73 = 683.10
    # min = 683.10; após redutor: 683.10 - 113.18 = 569.92
    assert irrf_with_reform == Decimal("569.92")


def test_calculate_irrf_reform_2026_above_threshold_no_redutor():
    # Renda >= R$ 7.350 não recebe o redutor da reforma.
    monthly_gross = Decimal("9000.00")
    inss = Decimal("988.11")  # INSS sobre 9000 (teto 8475.55)
    base = monthly_gross - inss

    irrf = calculate_irrf(
        base, 2026, 3, monthly_gross=monthly_gross, inss=inss,
    )
    # min(simplificado, tradicional) sem redutor.
    # Trad: (9000 - 988.11) × 0.275 - 908.73 = 1294.54
    # Simp: (9000 - 607.20) × 0.275 - 908.73 = 1399.29
    # min = 1294.54
    assert irrf == Decimal("1294.54")


def test_calculate_irrf_simplified_chosen_when_more_favorable():
    # Em rendas baixas onde INSS é pequeno, o simplificado pode ser pior.
    # Em rendas onde dependentes ajudam, tradicional pode ser melhor.
    # Aqui forçamos um caso com 0 dependentes onde simplificado é mais favorável:
    # renda 4000, INSS ~366, sem reforma 2026 (renda < 5000 → isenta de qualquer modo).
    # Vamos usar 5500 sem reforma (ano 2025 sem reforma).
    monthly_gross = Decimal("5500.00")
    inss = Decimal("605.00")  # aproximado
    base = monthly_gross - inss

    irrf_simp = calculate_irrf(
        base, 2025, 5, monthly_gross=monthly_gross, inss=inss,
        use_simplified_discount=True,
    )
    irrf_trad = calculate_irrf(
        base, 2025, 5, monthly_gross=monthly_gross, inss=inss,
        use_simplified_discount=False,
    )
    # Simplificado escolhe o min, tradicional força o tradicional.
    assert irrf_simp <= irrf_trad


def test_calculate_irrf_matches_real_payslip_february_2026():
    # Holerite fev/2026: renda bruta tributável 5.037,44, INSS 506,74 → IRRF 13,40.
    monthly_gross = Decimal("5037.44")
    inss = Decimal("506.74")
    irrf = calculate_irrf(
        monthly_gross - inss,
        2026,
        2,
        monthly_gross=monthly_gross,
        inss=inss,
    )
    assert irrf == Decimal("13.40")


def test_calculate_irrf_matches_real_payslip_march_2026():
    # Holerite mar/2026: renda bruta tributável 5.347,60, INSS 550,16 → IRRF 128,27.
    monthly_gross = Decimal("5347.60")
    inss = Decimal("550.16")
    irrf = calculate_irrf(
        monthly_gross - inss,
        2026,
        3,
        monthly_gross=monthly_gross,
        inss=inss,
    )
    assert irrf == Decimal("128.27")


def test_calculate_irrf_matches_real_payslip_january_2026_exempt():
    # Holerite jan/2026: renda bruta 4.583,28 (< 5.000) → IRRF 0,00.
    monthly_gross = Decimal("4583.28")
    inss = Decimal("443.16")
    irrf = calculate_irrf(
        monthly_gross - inss,
        2026,
        1,
        monthly_gross=monthly_gross,
        inss=inss,
    )
    assert irrf == Decimal("0.00")


def test_count_rest_and_working_days_april_2026():
    # Abril/2026: 30 dias, 4 domingos (5,12,19,26), 2 feriados:
    # Sexta-feira Santa (3/4) e Tiradentes (21/4 terça).
    # Descanso = 4 + 2 = 6; úteis = 30 - 6 = 24.
    rest_days, working = count_rest_and_working_days(4, 2026)
    assert rest_days == 6
    assert working == 24


def test_count_rest_and_working_days_january_2026_uses_holidays():
    # Jan/2026: 31 dias, 4 domingos (4,11,18,25), feriado 1/1 (quinta).
    # Descanso = 4 + 1 = 5; úteis = 31 - 5 = 26. Bate com holerite real.
    rest_days, working = count_rest_and_working_days(1, 2026)
    assert rest_days == 5
    assert working == 26


def test_count_rest_and_working_days_february_2026_no_holiday():
    # Fev/2026: 28 dias, 4 domingos, sem feriado nacional.
    rest_days, working = count_rest_and_working_days(2, 2026)
    assert rest_days == 4
    assert working == 24


def test_count_rest_and_working_days_march_2026_no_holiday():
    # Mar/2026: 31 dias, 5 domingos (1,8,15,22,29), sem feriado nacional.
    # (Sexta-feira Santa em 2026 é 3/abr, não conta para março.)
    rest_days, working = count_rest_and_working_days(3, 2026)
    assert rest_days == 5
    assert working == 26


def test_brazilian_holidays_includes_easter_friday_2026():
    holidays = brazilian_national_holidays(2026)
    # Páscoa 2026 = 5/abr → Sexta-feira Santa = 3/abr
    assert date(2026, 4, 3) in holidays
    assert date(2026, 1, 1) in holidays
    assert date(2026, 11, 20) in holidays  # Consciência Negra (nacional desde 2024)


def test_calculate_dsr_on_overtime_zero_when_no_overtime():
    assert calculate_dsr_on_overtime(Decimal("0.00"), 4, 2026) == Decimal("0.00")


def test_calculate_dsr_on_overtime_zero_when_period_missing():
    assert calculate_dsr_on_overtime(Decimal("500.00"), None, 2026) == Decimal("0.00")
    assert calculate_dsr_on_overtime(Decimal("500.00"), 4, None) == Decimal("0.00")


def test_calculate_dsr_matches_real_payslip_january_2026():
    # Holerite jan/2026 (CONTROLLER BMS): HE 70% R$ 830,86 → DSR R$ 159,78.
    # Fórmula: 830,86 × 5/26 = 159,78 (5 = 4 domingos + 1/1 feriado).
    assert calculate_dsr_on_overtime(Decimal("830.86"), 1, 2026) == Decimal("159.78")


def test_calculate_dsr_matches_real_payslip_february_2026():
    # Holerite fev/2026: HE total (70%+100%) R$ 1.138,02 → DSR R$ 189,67.
    # Fórmula: 1138,02 × 4/24 = 189,67.
    assert calculate_dsr_on_overtime(Decimal("1138.02"), 2, 2026) == Decimal("189.67")


def test_calculate_dsr_matches_real_payslip_march_2026():
    # Holerite mar/2026: HE 70% R$ 1.357,40 → DSR R$ 261,04.
    # Fórmula: 1357,40 × 5/26 = 261,04.
    assert calculate_dsr_on_overtime(Decimal("1357.40"), 3, 2026) == Decimal("261.04")


def test_calculate_net_salary_includes_dsr_in_gross_and_taxes():
    # Sem HE → DSR = 0, valores idênticos a antes da feature.
    no_overtime = calculate_net_salary(
        base_salary=Decimal("5000.00"),
        meal_allowance=Decimal("0"),
        health_plan_deduction=Decimal("0"),
        overtime_hours=Decimal("0"),
        overtime_multiplier=Decimal("0"),
        monthly_bonus=Decimal("0"),
        discounts_absences=Decimal("0"),
        reference_year=2026,
        reference_month=4,
    )
    assert no_overtime["dsr_value"] == Decimal("0.00")

    # Com HE → DSR > 0 e total bruto/INSS aumentam.
    # Abril/2026 tem 2 feriados (Sexta Santa 3/4 e Tiradentes 21/4) → descanso=6, úteis=24.
    with_overtime = calculate_net_salary(
        base_salary=Decimal("5000.00"),
        meal_allowance=Decimal("0"),
        health_plan_deduction=Decimal("0"),
        overtime_hours=Decimal("20"),
        overtime_multiplier=Decimal("0.70"),
        monthly_bonus=Decimal("0"),
        discounts_absences=Decimal("0"),
        reference_year=2026,
        reference_month=4,
    )
    # HE = 20 × (5000/220) × 1.70 = 772,73
    assert with_overtime["overtime_value"] == Decimal("772.73")
    # DSR = 772,73 × 6/24 = 193,18
    assert with_overtime["dsr_value"] == Decimal("193.18")
    # Bruto inclui DSR
    assert with_overtime["total_gross"] == Decimal("5965.91")
    # INSS aumenta vs cenário sem DSR (base = base + HE + DSR)
    assert with_overtime["inss"] > no_overtime["inss"]
