interface SalaryCalc {
  totalGross: number
  totalDeductions: number
  netSalary: number
  inss: number
  irrf: number
}

interface Props {
  calc: SalaryCalc
  baseSalary: number
  mealAllowance: number
  healthPlanDeduction: number
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export default function MonthlySummary({ calc, baseSalary, mealAllowance, healthPlanDeduction }: Props) {
  return (
    <div className="bg-surface-container border-l-4 border-l-primary border border-outline-variant rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
          <h3 className="text-lg font-bold uppercase tracking-tight">Resumo do Mês</h3>
        </div>
        <button className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors">open_in_new</button>
      </div>
      <div className="space-y-6">
        {/* Total Bruto */}
        <div className="flex justify-between items-center p-4 bg-surface-container-low rounded-lg border border-outline-variant">
          <div>
            <p className="text-xs text-on-secondary-container font-bold uppercase">Total Bruto</p>
            <p className="text-xl font-black font-mono">{fmt(calc.totalGross)}</p>
          </div>
          <span className="material-symbols-outlined text-tertiary">trending_up</span>
        </div>

        {/* Total Descontos */}
        <div className="flex justify-between items-center p-4 bg-surface-container-low rounded-lg border border-outline-variant">
          <div>
            <p className="text-xs text-on-secondary-container font-bold uppercase">Total Descontos</p>
            <p className="text-xl font-black font-mono text-error">{fmt(calc.totalDeductions)}</p>
          </div>
          <span className="material-symbols-outlined text-error">trending_down</span>
        </div>

        {/* Salario Liquido Estimado */}
        <div className="p-6 bg-primary/10 border border-primary/20 rounded-xl space-y-1">
          <p className="text-xs text-primary font-bold uppercase tracking-widest text-center">Salário Líquido Estimado</p>
          <p className="text-4xl font-black text-center text-primary font-mono">{fmt(calc.netSalary)}</p>
        </div>
      </div>

      {/* Base de Calculo */}
      <div className="mt-8 space-y-4">
        <h4 className="text-xs font-bold text-on-secondary-container uppercase tracking-widest">Base de Cálculo</h4>
        <ul className="space-y-3">
          <li className="flex justify-between text-sm">
            <span className="text-on-secondary-container">Salário Base</span>
            <span className="font-mono text-on-surface">{fmt(baseSalary)}</span>
          </li>
          <li className="flex justify-between text-sm">
            <span className="text-on-secondary-container">Auxílio Refeição</span>
            <span className="font-mono text-tertiary">+ {fmt(mealAllowance)}</span>
          </li>
          <li className="flex justify-between text-sm">
            <span className="text-on-secondary-container">Plano de Saúde</span>
            <span className="font-mono text-error">- {fmt(healthPlanDeduction)}</span>
          </li>
          <li className="flex justify-between text-sm">
            <span className="text-on-secondary-container">INSS</span>
            <span className="font-mono text-error">- {fmt(calc.inss)}</span>
          </li>
          <li className="flex justify-between text-sm">
            <span className="text-on-secondary-container">IRRF</span>
            <span className="font-mono text-error">- {fmt(calc.irrf)}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
