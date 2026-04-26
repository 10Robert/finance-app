import calendar
from datetime import date, timedelta
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
    dsr_value: Decimal
    inss: Decimal
    irrf: Decimal
    total_gross: Decimal
    total_deductions: Decimal
    net_salary: Decimal


def money(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _easter_sunday(year: int) -> date:
    """Algoritmo Anônimo Gregoriano para o domingo de Páscoa."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def brazilian_national_holidays(year: int) -> set[date]:
    """Feriados nacionais que contam como descanso para DSR (Lei 9.093/95).

    Carnaval (segunda/terça) é facultativo e NÃO entra. Corpus Christi também é
    facultativo. Apenas os 9 feriados nacionais oficiais + Sexta-feira Santa.
    """
    holidays = {
        date(year, 1, 1),    # Confraternização Universal
        date(year, 4, 21),   # Tiradentes
        date(year, 5, 1),    # Dia do Trabalho
        date(year, 9, 7),    # Independência
        date(year, 10, 12),  # Nossa Senhora Aparecida
        date(year, 11, 2),   # Finados
        date(year, 11, 15),  # Proclamação da República
        date(year, 11, 20),  # Consciência Negra (nacional desde 2024)
        date(year, 12, 25),  # Natal
    }
    holidays.add(_easter_sunday(year) - timedelta(days=2))  # Sexta-feira Santa
    return holidays


def count_rest_and_working_days(month: int, year: int) -> tuple[int, int]:
    """Conta dias de descanso (domingos + feriados) e dias úteis do mês.

    Segue Lei 605/49 + Lei 9.093/95: feriados nacionais entram como descanso e
    saem dos dias úteis. Quando um feriado cai no domingo, conta uma vez só.
    Sábado é tratado como dia útil para o cálculo de DSR.
    """
    holidays = brazilian_national_holidays(year)
    rest_days = 0
    working = 0
    for day in calendar.Calendar().itermonthdays(year, month):
        if day == 0:
            continue
        d = date(year, month, day)
        if d.weekday() == 6 or d in holidays:
            rest_days += 1
        else:
            working += 1
    return rest_days, working


def calculate_dsr_on_overtime(
    overtime_value: Decimal,
    month: int | None,
    year: int | None,
) -> Decimal:
    """Calcula o DSR sobre horas extras (Súmula 172 TST + Lei 605/49).

    Fórmula para mensalistas:
        DSR = HE_total × dias_descanso / dias_úteis

    Considera domingos + feriados nacionais oficiais como dias de descanso.
    Quando ``month`` ou ``year`` não são informados, retorna 0 — sem o calendário
    do mês não há como apurar os divisores.
    """
    if overtime_value <= Decimal("0") or month is None or year is None:
        return Decimal("0.00")
    rest_days, working = count_rest_and_working_days(month, year)
    if working == 0:
        return Decimal("0.00")
    return money(overtime_value * Decimal(rest_days) / Decimal(working))


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
        # Reforma do IR 2026 (Lei nº 15.270/2025, ex-PL 1.087/2025):
        # - Renda mensal bruta tributável <= R$ 5.000 → IRRF zerado
        # - Entre R$ 5.000,01 e R$ 7.350 → aplicar redutor (fórmula oficial RFB):
        #     redutor = 978,62 - (0,133145 × renda_bruta_mensal)
        #   IRRF efetivo = max(0, IRRF_apurado − redutor)
        # - Acima de R$ 7.350 → tabela normal sem redutor
        "reform_2026_exemption_threshold": Decimal("5000.00"),
        "reform_2026_max_threshold": Decimal("7350.00"),
        "reform_2026_redutor_constant": Decimal("978.62"),
        "reform_2026_redutor_factor": Decimal("0.133145"),
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


DEPENDENT_DEDUCTION = Decimal("189.59")  # Dedução por dependente desde 2015


def _apply_irrf_brackets(taxable_base: Decimal, brackets) -> Decimal:
    """Aplica a tabela progressiva sobre a base já líquida das deduções."""
    for limit, rate, deduction in brackets:
        if taxable_base <= limit:
            return money(max(taxable_base * rate - deduction, Decimal("0")))
    return Decimal("0.00")


def calculate_irrf(
    base_after_inss: Decimal,
    reference_year: int,
    reference_month: int | None = None,
    monthly_gross: Decimal | None = None,
    inss: Decimal | None = None,
    dependents: int = 0,
    use_simplified_discount: bool = True,
) -> Decimal:
    """
    Calcula o IRRF mensal aplicando o método mais favorável ao contribuinte.

    A fonte pagadora pode optar pelo Desconto Simplificado Mensal (Lei 14.663/2023):
      - **Simplificado:** base = renda_bruta − R$ 607,20 (substitui INSS, dependentes, etc.).
      - **Tradicional:** base = renda_bruta − INSS − (dependentes × R$ 189,59).

    Quando ``use_simplified_discount=True`` (padrão), aplica o método mais favorável
    entre os dois (menor IRRF). A maioria das empresas brasileiras adota o
    simplificado por padrão a partir de 2024.

    Reforma 2026 (Lei nº 15.270/2025):
      - renda <= R$ 5.000 → isento
      - R$ 5.000 < renda < R$ 7.350 → aplica redutor:
          redutor = 978,62 − (0,133145 × renda_bruta_mensal)
          IRRF efetivo = max(0, IRRF_apurado − redutor)
      - renda >= R$ 7.350 → tabela normal sem redutor

    Args:
        base_after_inss: renda tributável menos INSS (legado; usado quando
            ``monthly_gross`` ou ``inss`` não são informados).
        reference_year: ano de referência (define a tabela aplicável).
        reference_month: mês de referência (necessário em 2025 para regras pré/pós abril).
        monthly_gross: renda bruta mensal tributável (antes do INSS). Necessária para
            o desconto simplificado e para a reforma 2026.
        inss: valor do INSS retido — usado apenas no método tradicional. Quando
            omitido, é inferido como ``monthly_gross − base_after_inss``.
        dependents: número de dependentes (apenas método tradicional).
        use_simplified_discount: se True, calcula pelos dois métodos e usa o menor.
    """
    rule = _resolve_irrf_rule(reference_year, reference_month)

    # Se não temos a renda bruta, caímos no comportamento legado (sempre simplificado
    # mas em cima de base_after_inss — mantido por retrocompatibilidade dos chamadores).
    if monthly_gross is None:
        legacy_base = max(base_after_inss - rule["monthly_simplified_deduction"], Decimal("0"))
        return _apply_irrf_brackets(legacy_base, rule["brackets"])

    # Método tradicional: base = bruto − INSS − dependentes × R$ 189,59
    inss_used = inss if inss is not None else (monthly_gross - base_after_inss)
    base_traditional = max(
        monthly_gross - inss_used - (Decimal(dependents) * DEPENDENT_DEDUCTION),
        Decimal("0"),
    )
    irrf_traditional = _apply_irrf_brackets(base_traditional, rule["brackets"])

    # Método simplificado: base = bruto − R$ 607,20 (substitui todas as deduções)
    base_simplified = max(monthly_gross - rule["monthly_simplified_deduction"], Decimal("0"))
    irrf_simplified = _apply_irrf_brackets(base_simplified, rule["brackets"])

    if use_simplified_discount:
        irrf = min(irrf_traditional, irrf_simplified)
    else:
        irrf = irrf_traditional

    # Reforma 2026 — só aplica se a regra do ano publica os parâmetros.
    exemption = rule.get("reform_2026_exemption_threshold")
    max_threshold = rule.get("reform_2026_max_threshold")
    redutor_const = rule.get("reform_2026_redutor_constant")
    redutor_factor = rule.get("reform_2026_redutor_factor")
    if exemption is not None and max_threshold is not None:
        if monthly_gross <= exemption:
            return Decimal("0.00")
        if monthly_gross < max_threshold and redutor_const is not None and redutor_factor is not None:
            redutor = money(redutor_const - redutor_factor * monthly_gross)
            irrf = money(max(irrf - redutor, Decimal("0")))

    return irrf


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
    dsr_value = calculate_dsr_on_overtime(overtime_value, reference_month, reference_year)

    total_gross = money(base_salary + meal_allowance + overtime_value + dsr_value + monthly_bonus)
    inss_base = base_salary + overtime_value + dsr_value + monthly_bonus
    inss = calculate_inss(inss_base, reference_year)
    irrf_base = inss_base - inss
    irrf = calculate_irrf(
        irrf_base,
        reference_year,
        reference_month,
        monthly_gross=inss_base,
        inss=inss,
    )
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
        "dsr_value": dsr_value,
        "inss": inss,
        "irrf": irrf,
        "total_gross": total_gross,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
    }
