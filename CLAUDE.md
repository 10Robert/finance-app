# Obsidian Finance — Projeto de Gestão Financeira

## Visão Geral
App fullstack de gestão financeira pessoal com tema dark "Obsidian". Permite controlar transações, importar extratos bancários via PDF/CSV com categorização por IA (Claude API), calcular rendimentos com INSS/IRRF, e visualizar dashboards com gráficos.

**Repositório:** https://github.com/10Robert/finance-app
**Dono:** Robert (robertlucasmtz124@gmail.com)

---

## Tech Stack

### Backend
- **FastAPI** (Python) — API REST assíncrona
- **PostgreSQL** via asyncpg + **SQLAlchemy 2.0** (async ORM)
- **Pydantic v2** — validação de dados/schemas
- **Anthropic Claude API** — categorização inteligente de extratos bancários
- **pdfplumber** — parsing de PDFs

### Frontend
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS 4** — estilização
- **TanStack React Query** — cache/estado de servidor
- **React Router v7** — rotas SPA
- **Recharts** — gráficos
- **Axios** — HTTP client (proxy `/api` → `localhost:8000`)
- **Material Symbols Outlined** — ícones
- **Fonte:** Geist

### Infra
- Frontend: `localhost:5173` (Vite dev server)
- Backend: `localhost:8000` (Uvicorn)
- DB: `postgresql+asyncpg://postgres:postgres@localhost:5432/finance_app`
- Scripts: `start.bat`, `stop.bat`, `reload.bat`

---

## Estrutura de Pastas

```
finance-app/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app + routers
│       ├── config.py            # Settings (DB URL, API key)
│       ├── database.py          # Async session + engine
│       ├── models.py            # SQLAlchemy models
│       ├── schemas.py           # Pydantic schemas
│       ├── seed_categories.py   # 22 categorias padrão PT-BR
│       ├── seed_data.py         # Dados iniciais
│       ├── routers/
│       │   ├── dashboard.py     # Endpoints: balance, revenue, spending-flow, top-categories, recent-transactions, chart-6months, category-progress, transactions-grouped
│       │   ├── transactions.py  # CRUD transações
│       │   ├── categories.py    # CRUD categorias
│       │   ├── imports.py       # Upload/process/confirm extratos
│       │   ├── salary.py        # Config salário, descontos, horas extras, cálculo
│       │   └── incomes.py       # Cálculo INSS/IRRF, histórico de renda
│       └── services/
│           ├── import_service.py
│           ├── llm_service.py        # Claude API para categorização
│           ├── parser_service.py     # Parse CSV/PDF
│           └── salary_calculator.py
├── frontend/
│   └── src/
│       ├── App.tsx              # Layout principal (sidebar + header + rotas)
│       ├── main.tsx             # Entry point
│       ├── api/client.ts        # Axios client com todas as funções de API
│       ├── types/index.ts       # Interfaces TypeScript
│       ├── pages/
│       │   ├── DashboardPage.tsx    # Painel — cards resumo, fluxo gastos, categorias, transações recentes
│       │   ├── ExpensesPage.tsx     # Gastos — gráfico 6 meses, distribuição categoria, avulsos/fixos
│       │   ├── TransactionsPage.tsx # Transações — CRUD com tabela e formulário
│       │   ├── ImportPage.tsx       # Importação — upload e revisão de extratos
│       │   ├── SalaryPage.tsx       # Rendimentos — cálculo salário com INSS/IRRF
│       │   └── SettingsPage.tsx     # Configurações — salário bruto, gerenciar categorias
│       ├── components/
│       │   ├── TransactionForm.tsx
│       │   ├── TransactionTable.tsx
│       │   ├── TransactionListCard.tsx
│       │   ├── ImportReview.tsx
│       │   ├── charts/
│       │   │   ├── SpendingFlowChart.tsx
│       │   │   ├── MonthlySpendingChart.tsx
│       │   │   ├── CategoryDistribution.tsx
│       │   │   ├── IncomeVsExpense.tsx
│       │   │   ├── MonthlyTrends.tsx
│       │   │   └── SpendingByCategory.tsx
│       │   └── income/
│       │       ├── MonthlySummary.tsx
│       │       └── IncomeHistory.tsx
│       └── utils/
│           └── salaryCalc.ts
├── start.bat / stop.bat / reload.bat
├── .claude/launch.json          # Configs para preview (FastAPI + Vite)
└── CLAUDE.md                    # Este arquivo
```

---

## Rotas do Frontend

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | DashboardPage | Painel com 4 cards resumo, fluxo de gastos, top categorias, transações recentes |
| `/expenses` | ExpensesPage | Gráfico 6 meses, distribuição por categoria, gastos avulsos e fixos |
| `/transactions` | TransactionsPage | CRUD completo de transações com filtros |
| `/import` | ImportPage | Upload e revisão de extratos bancários (CSV/PDF) |
| `/salary` | SalaryPage | Cálculo de rendimentos com INSS/IRRF |
| `/settings` | SettingsPage | Salário bruto, gerenciar categorias de gastos |

---

## Endpoints da API (Backend)

### Dashboard (`/api/dashboard/`)
- `GET /balance` — saldo, receita, despesa, variação %
- `GET /monthly-revenue` — receita do mês/ano
- `GET /spending-flow` — pontos de fluxo (mensal/anual)
- `GET /top-categories` — top N categorias por gasto
- `GET /recent-transactions` — últimas N transações
- `GET /chart-6months` — gastos dos últimos 6 meses
- `GET /category-progress` — breakdown por categoria com %
- `GET /transactions-grouped` — avulsos vs recorrentes

### Transactions (`/api/transactions/`)
- `GET /` — listar (paginado, com filtros)
- `POST /` — criar
- `PUT /{id}` — atualizar
- `DELETE /{id}` — deletar

### Categories (`/api/categories/`)
- `GET /` — listar
- `POST /` — criar (name, type, icon)
- `PUT /{id}` — atualizar
- `DELETE /{id}` — deletar

### Imports (`/api/imports/`)
- `GET /` — listar importações
- `POST /upload` — upload arquivo
- `POST /{id}/process` — processar com Claude AI
- `GET /{id}/staged` — ver transações em staging
- `PUT /{id}/staged` — atualizar staging
- `POST /{id}/confirm` — confirmar importação

### Salary (`/api/salary/`)
- `GET /config` — obter config
- `POST /config` — criar/atualizar config (base_salary, overtime_hour_rate, meal_allowance, health_plan_deduction)
- `PUT /config` — atualizar parcial
- `POST /discounts` — adicionar desconto
- `DELETE /discounts/{id}` — remover desconto
- `POST /overtime` — adicionar hora extra
- `DELETE /overtime/{id}` — remover hora extra
- `GET /calculate` — calcular salário do mês

### Incomes (`/api/incomes/`)
- `POST /calculate` — simular renda
- `POST /launch` — lançar renda
- `GET /` — listar rendas
- `DELETE /{id}` — deletar

---

## Design System — Obsidian Dark

- **Background:** `#09090b` (near-black)
- **Surface:** zinc grays (`#0c0c0f` → `#27272a`)
- **Primary:** `#a78bfa` (violet)
- **Tertiary:** `#34d399` (emerald — sucesso)
- **Error:** `#ef4444` (red)
- **Text primário:** `#fafafa`
- **Text secundário:** `#a1a1aa`
- **Bordas:** `1px solid #27272a` (nunca sombras)
- **Cards:** `surface_container` bg, `outline_variant` border, `rounded-xl`
- **Inputs:** `#09090b` bg, `outline_variant` border, violet focus ring
- **Botão primário:** solid violet fill, text `#09090b`
- **Botão secundário:** transparent + border violet

---

## Modelos do Banco (SQLAlchemy)

- **Category** — id, name, type (expense/income), icon
- **Transaction** — id, date, description, amount, type, category_id, is_recurring, recurring_day, icon, notes
- **BankImport** — id, filename, file_type, row_count, status, error_message
- **StagedTransaction** — id, bank_import_id, date, description, amount, type, category_id, confidence, original_text, accepted
- **SalaryConfig** — id, base_salary, overtime_hour_rate, meal_allowance, health_plan_deduction
- **Discount** — id, salary_config_id, name, type (fixed/percent), value
- **OvertimeEntry** — id, salary_config_id, month, year, hours, rate_percent (70/100)
- **Income** — id, reference_month/year, base_salary, meal_allowance, health_plan_deduction, overtime_hours/multiplier, monthly_bonus, discounts_absences, overtime_value, inss, irrf, total_gross, total_deductions, net_salary

---

## Workflow de Versionamento

Cada feature é commitada individualmente com mensagem descritiva no formato:
```
feat: descrição curta da funcionalidade

- Detalhe 1
- Detalhe 2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Histórico de Versões
1. `6742568` — **v1.0** Sistema base: backend FastAPI, frontend React, CRUD transações, dashboard, importação de extratos
2. `9687d4c` — **v1.1** Tela de Gastos, módulo de Rendimentos, restauração do Painel original
3. `6bdb1b4` — **v1.2** Tela de Configurações com salário bruto e gerenciamento de categorias

---

## Comandos Úteis

```bash
# Iniciar tudo
start.bat

# Parar
stop.bat

# Backend manual
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload

# Frontend manual
cd frontend && npm run dev

# Commit de feature
git add <files>
git commit -m "feat: descrição"
git push origin master
```

---

## Notas para Sessões Futuras

- Sempre ler este CLAUDE.md primeiro para contexto completo
- Manter padrão de commit por feature individual
- Seguir o Design System Obsidian Dark rigorosamente
- APIs backend já existem para a maioria das operações — verificar `api/client.ts` e `routers/` antes de criar novos endpoints
- Usar TanStack Query para todas as chamadas de API no frontend (queryKey + invalidation)
- Material Symbols Outlined para ícones (não Font Awesome)
- Confirmar com o usuário antes de push para GitHub
