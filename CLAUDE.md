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
- **pdfplumber** — parsing de extratos PDF
- **docling** — parsing de faturas de cartão em PDF

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
│       │   ├── dashboard.py        # balance, monthly-revenue, spending-flow, top-categories, recent-transactions, summary, spending-by-category, monthly-trends, chart-6months, category-progress, transactions-grouped, expenses-chart, category-transactions
│       │   ├── transactions.py     # CRUD transações
│       │   ├── categories.py       # CRUD categorias
│       │   ├── imports.py          # Upload/process/confirm extratos
│       │   ├── salary.py           # Config salário, descontos, horas extras, cálculo
│       │   ├── incomes.py          # Cálculo INSS/IRRF, histórico de renda
│       │   ├── monthly_entries.py  # Lançamentos do mês (overtime/refund/late/absence) + summary
│       │   ├── fixed_expenses.py   # Gastos fixos recorrentes
│       │   ├── installments.py     # Compras parceladas
│       │   └── credit_cards.py     # Cartões, gastos, faturas, parcelas, assinaturas, import PDF, analytics
│       └── services/
│           ├── import_service.py
│           ├── llm_service.py        # Claude API para categorização
│           ├── parser_service.py     # Parse CSV/PDF
│           ├── docling_service.py    # Parse de fatura PDF (cartão) via docling
│           ├── category_learning.py  # Aprende regras de categoria a partir de imports confirmados
│           ├── salary_sync.py        # Sincroniza config de salário ↔ rendas
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
│       │   ├── SalaryPage.tsx       # Rendimentos — cálculo salário com INSS/IRRF
│       │   ├── SettingsPage.tsx     # Configurações — salário bruto, gerenciar categorias
│       │   ├── CreditCardsPage.tsx  # Cartão de Crédito — orquestra cartões, faturas, lançamentos
│       │   └── creditcards/         # Componentes da página de cartão (split do monolito)
│       │       ├── shared.tsx       # Constantes, formatadores e primitivas (Modal, Field, etc.)
│       │       ├── charts.tsx       # MonthStrip, SpendHeatmap, StackedBarsChart, TreemapChart
│       │       └── modals.tsx       # AddTx, MonthDetail, Lancamento, CardForm, Bill, Anticipate, EditExpense, PdfImport
│       ├── components/
│       │   ├── TransactionForm.tsx
│       │   ├── TransactionTable.tsx
│       │   ├── TransactionListCard.tsx
│       │   ├── ImportReview.tsx
│       │   ├── feedback/            # Toast, ConfirmDialog (hooks useToast/useConfirm)
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
│       ├── theme/
│       │   └── ThemeContext.tsx     # Tema claro/escuro persistente
│       └── utils/
│           ├── salaryCalc.ts
│           ├── a11y.ts              # useFocusTrap, useEscapeKey
│           └── errors.ts            # extractError
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
| `/credit-cards` | CreditCardsPage | Cartões, faturas mensais, lançamentos, parcelas, assinaturas, import de fatura PDF |
| `/transactions` | TransactionsPage | CRUD completo de transações com filtros |
| `/salary` | SalaryPage | Cálculo de rendimentos com INSS/IRRF |
| `/settings` | SettingsPage | Salário bruto, gerenciar categorias de gastos |

> **Obs:** o item de menu `/reports` (Relatórios) existe na sidebar mas ainda não tem rota/página implementada.

---

## Endpoints da API (Backend)

### Dashboard (`/api/dashboard/`)
- `GET /balance` — saldo, receita, despesa, variação %
- `GET /monthly-revenue` — receita do mês/ano
- `GET /spending-flow` — pontos de fluxo (mensal/anual)
- `GET /top-categories` — top N categorias por gasto
- `GET /recent-transactions` — últimas N transações
- `GET /summary` — resumo agregado
- `GET /spending-by-category` — gasto por categoria
- `GET /monthly-trends` — tendências mensais
- `GET /chart-6months` — gastos dos últimos 6 meses
- `GET /category-progress` — breakdown por categoria com %
- `GET /transactions-grouped` — avulsos vs recorrentes
- `GET /expenses-chart` — dados do gráfico da tela de Gastos
- `GET /category-transactions` — transações de uma categoria

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
- `GET /{id}` — obter renda
- `DELETE /{id}` — deletar

### Monthly Entries (`/api/monthly-entries/`)
- `GET /` — listar lançamentos do mês (overtime/refund/late/absence)
- `POST /` — criar lançamento
- `PUT /{id}` — atualizar
- `DELETE /{id}` — remover
- `GET /summary` — resumo consolidado do mês (bruto, descontos, líquido, FGTS)

### Fixed Expenses (`/api/fixed-expenses/`)
- `GET /` — listar gastos fixos
- `POST /` — criar gasto fixo (permanente ou com data de término)
- `DELETE /{id}` — remover

### Installments (`/api/installments/`)
- `GET /` — listar compras parceladas
- `POST /` — criar compra parcelada
- `DELETE /{id}` — remover

### Credit Cards (`/api/credit-cards/`)
- `GET /cards` · `POST /cards` · `PUT /cards/{id}` · `DELETE /cards/{id}` — CRUD de cartões
- `POST /expenses` · `GET /expenses` · `PUT /expenses/{id}` · `DELETE /expenses/{id}` — gastos
- `POST /expenses/{id}/refund` · `POST /expenses/{id}/unrefund` — marcar/desfazer reembolso
- `POST /expenses/bulk` — criação em lote (usado pelo import de PDF)
- `POST /installments/{id}/anticipate` — antecipar parcela para outro mês
- `GET /bills/months` — resumo por mês das faturas
- `GET /bills/{year}/{month}` — itens da fatura de um mês
- `GET /subscriptions` — assinaturas ativas
- `GET /analytics/daily/{year}/{month}` — gasto por dia (heatmap)
- `GET /analytics/by-category` · `GET /analytics/by-type` — analytics da fatura
- `POST /import-pdf/parse` — analisar fatura PDF com IA (retorna itens para revisão)

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
- **Transaction** — id, date, description, amount, type, category_id, is_recurring, recurring_day, icon, source, notes, bank_import_id
- **BankImport** — id, filename, file_type, row_count, status, error_message
- **StagedTransaction** — id, bank_import_id, date, description, amount, type, category_id, confidence, original_text, accepted
- **SalaryConfig** — id, reference_month/year (constraint único), base_salary, overtime_hour_rate, meal_allowance, health_plan_deduction, dental_plan_deduction, transport_voucher_enabled/percent, coparticipation, fgts_balance
- **Discount** — id, salary_config_id, name, type (fixed/percent), value
- **OvertimeEntry** — id, salary_config_id, month, year, hours, rate_percent (70/100)
- **MonthlyEntry** — id, reference_month/year, entry_type (overtime/refund/late/absence), entry_date, description, amount, hours, overtime_multiplier (0.30/0.70/1.00), days
- **FixedExpense** — id, description, amount, category_id, day_of_month, is_permanent, start_date, end_date, active, icon
- **InstallmentPurchase** — id, description, total_amount, installment_count, category_id, start_date, icon
- **CreditCard** — id, name, brand, color, credit_limit, closing_day, due_day, active
- **CreditCardExpense** — id, credit_card_id, category_id, description, amount, purchase_date, installment_count, is_subscription, is_refunded, refunded_at, notes, icon
- **CreditCardInstallment** — id, expense_id, credit_card_id, installment_number, amount, bill_month/year, original_bill_month/year (rastreio de antecipação)
- **CategoryRule** — id, pattern (descrição normalizada), type, category_id, hit_count, last_used_at — regra aprendida para categorizar imports automaticamente
- **Income** — id, reference_month/year, base_salary, meal_allowance, health_plan_deduction, overtime_hours/multiplier, monthly_bonus, discounts_absences, overtime_value, dsr_value, inss, irrf, total_gross, total_deductions, net_salary

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
- **Migrações de schema:** atualmente feitas via `ALTER TABLE ... IF NOT EXISTS` inline no `lifespan` de `main.py` (`create_all` só cria tabelas novas, nunca adiciona colunas). Alembic já está nas dependências mas ainda não há migrations versionadas.
