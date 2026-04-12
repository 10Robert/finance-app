# Tutorial: Como Implementar uma Nova Funcionalidade no Obsidian Finance

> **Exemplo prático:** Tela de Cadastro de Cartões de Crédito que salva no banco e cria automaticamente gastos fixos.

---

## Visão Geral dos Passos

```
┌─────────────────────────────────────────────────┐
│  1. BACKEND                                     │
│     ├── 1.1 Model (banco de dados)              │
│     ├── 1.2 Schema (validação de dados)         │
│     ├── 1.3 Router (endpoints da API)           │
│     └── 1.4 Registrar router no main.py         │
│                                                 │
│  2. FRONTEND                                    │
│     ├── 2.1 Types (interfaces TypeScript)       │
│     ├── 2.2 API Client (funções Axios)          │
│     ├── 2.3 Page (componente React)             │
│     └── 2.4 Registrar rota no App.tsx           │
│                                                 │
│  3. VERSIONAMENTO                               │
│     ├── 3.1 git add (arquivos alterados)        │
│     ├── 3.2 git commit (mensagem descritiva)    │
│     └── 3.3 git push (enviar ao GitHub)         │
└─────────────────────────────────────────────────┘
```

---

## PASSO 1 — BACKEND

### 1.1 Criar o Model (tabela no banco)

**Arquivo:** `backend/app/models.py`

Adicione a nova classe **no final** do arquivo. Siga o padrão dos models existentes:

```python
# ─── MODELO EXISTENTE (referência) ───
class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(10))
    icon: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")


# ─── NOVO MODELO: CreditCard ───
class CreditCard(Base):
    __tablename__ = "credit_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))          # Ex: "Nubank Platinum"
    last_four: Mapped[str] = mapped_column(String(4))       # Últimos 4 dígitos
    brand: Mapped[str] = mapped_column(String(30))          # visa, mastercard, elo
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    closing_day: Mapped[int] = mapped_column(Integer)       # Dia de fechamento (1-31)
    due_day: Mapped[int] = mapped_column(Integer)           # Dia de vencimento (1-31)
    icon: Mapped[str] = mapped_column(String(50), default="credit_card", server_default="credit_card")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
```

**Regras do padrão:**
- Sempre `id: Mapped[int]` como primary key
- Campos monetários: `Numeric(12, 2)` com tipo `Decimal`
- Campos opcionais: `Mapped[str | None]`
- Timestamps: `server_default=func.now()`
- O banco é criado automaticamente pelo `Base.metadata.create_all` no `main.py`

---

### 1.2 Criar os Schemas (validação Pydantic)

**Arquivo:** `backend/app/schemas.py`

Adicione **3 schemas** no final do arquivo (Create, Update, Out):

```python
# ─── SCHEMA EXISTENTE (referência) ───
class CategoryCreate(BaseModel):
    name: str
    type: str
    icon: str | None = None

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    icon: str | None
    created_at: datetime


# ─── NOVOS SCHEMAS: CreditCard ───

class CreditCardCreate(BaseModel):
    """Dados necessários para CRIAR um cartão"""
    name: str                          # Nome do cartão
    last_four: str                     # Últimos 4 dígitos
    brand: str                         # visa, mastercard, elo
    credit_limit: float                # Limite de crédito
    closing_day: int                   # Dia de fechamento
    due_day: int                       # Dia de vencimento
    icon: str = "credit_card"          # Ícone (opcional)


class CreditCardUpdate(BaseModel):
    """Dados opcionais para ATUALIZAR um cartão"""
    name: str | None = None
    credit_limit: float | None = None
    closing_day: int | None = None
    due_day: int | None = None
    is_active: bool | None = None
    icon: str | None = None


class CreditCardOut(BaseModel):
    """Dados retornados pela API (leitura)"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    last_four: str
    brand: str
    credit_limit: float
    closing_day: int
    due_day: int
    icon: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
```

**Regras do padrão:**
- `Create` — campos obrigatórios para criação (sem `id`, sem timestamps)
- `Update` — todos os campos opcionais (`str | None = None`)
- `Out` — todos os campos do model + `model_config = ConfigDict(from_attributes=True)`
- Valores monetários são `float` no schema (Pydantic converte para `Decimal` no model)

---

### 1.3 Criar o Router (endpoints da API)

**Arquivo NOVO:** `backend/app/routers/credit_cards.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CreditCard, Transaction
from app.schemas import CreditCardCreate, CreditCardUpdate, CreditCardOut

router = APIRouter()


# ─── LISTAR todos os cartões ───
@router.get("/", response_model=list[CreditCardOut])
async def list_credit_cards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditCard).order_by(CreditCard.created_at.desc())
    )
    return result.scalars().all()


# ─── BUSCAR um cartão por ID ───
@router.get("/{card_id}", response_model=CreditCardOut)
async def get_credit_card(card_id: int, db: AsyncSession = Depends(get_db)):
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Credit card not found")
    return card


# ─── CRIAR um novo cartão + gasto fixo automático ───
@router.post("/", response_model=CreditCardOut, status_code=201)
async def create_credit_card(data: CreditCardCreate, db: AsyncSession = Depends(get_db)):
    # 1. Cria o cartão
    card = CreditCard(**data.model_dump())
    db.add(card)
    await db.flush()  # Gera o ID sem commitar

    # 2. Cria automaticamente uma transação recorrente (gasto fixo)
    from datetime import date as date_type
    transaction = Transaction(
        date=date_type.today(),
        description=f"Fatura {data.name} (*{data.last_four})",
        amount=0,  # Valor será atualizado mensalmente
        type="expense",
        is_recurring=True,
        recurring_day=data.due_day,
        icon="credit_card",
    )
    db.add(transaction)

    await db.commit()
    await db.refresh(card)
    return card


# ─── ATUALIZAR um cartão ───
@router.put("/{card_id}", response_model=CreditCardOut)
async def update_credit_card(
    card_id: int,
    data: CreditCardUpdate,
    db: AsyncSession = Depends(get_db),
):
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Credit card not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(card, key, value)

    await db.commit()
    await db.refresh(card)
    return card


# ─── DELETAR um cartão ───
@router.delete("/{card_id}", status_code=204)
async def delete_credit_card(card_id: int, db: AsyncSession = Depends(get_db)):
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Credit card not found")
    await db.delete(card)
    await db.commit()
```

**Regras do padrão:**
- Sempre `router = APIRouter()`
- Injeção de dependência: `db: AsyncSession = Depends(get_db)`
- Erros: `raise HTTPException(404, "mensagem")`
- CRUD completo: GET (listar), GET/:id, POST, PUT/:id, DELETE/:id
- `response_model` em cada endpoint para tipagem automática

---

### 1.4 Registrar o Router no main.py

**Arquivo:** `backend/app/main.py`

Duas alterações:

```python
# 1. Adicionar o import (linha ~7)
from app.routers import transactions, categories, imports, dashboard, salary, incomes, credit_cards
#                                                                                      ^^^^^^^^^^^^

# 2. Adicionar o include_router (depois dos outros)
app.include_router(credit_cards.router, prefix="/api/credit-cards", tags=["credit-cards"])
```

**✅ Backend pronto!** A tabela será criada automaticamente ao iniciar o servidor.

---

## PASSO 2 — FRONTEND

### 2.1 Criar os Types (interfaces TypeScript)

**Arquivo:** `frontend/src/types/index.ts`

Adicione no final do arquivo:

```typescript
// ─── TIPO EXISTENTE (referência) ───
export interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  icon: string | null
  created_at: string
}


// ─── NOVOS TIPOS: CreditCard ───

export interface CreditCard {
  id: number
  name: string
  last_four: string
  brand: 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard'
  credit_limit: number
  closing_day: number
  due_day: number
  icon: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreditCardCreate {
  name: string
  last_four: string
  brand: string
  credit_limit: number
  closing_day: number
  due_day: number
  icon?: string
}
```

**Regras do padrão:**
- Interface espelha o schema `Out` do backend
- Datas são `string` (ISO format)
- Valores monetários são `number`
- Campos opcionais no Create usam `?`

---

### 2.2 Criar as Funções no API Client

**Arquivo:** `frontend/src/api/client.ts`

Adicione no final do arquivo:

```typescript
import type {
  // ... imports existentes ...,
  CreditCard,
  CreditCardCreate,
} from '../types'


// ─── FUNÇÕES EXISTENTES (referência) ───
export const getCategories = () =>
  api.get<Category[]>('/categories/').then((r) => r.data)

export const createCategory = (data: { name: string; type: string; icon?: string }) =>
  api.post<Category>('/categories/', data).then((r) => r.data)

export const deleteCategory = (id: number) =>
  api.delete(`/categories/${id}`)


// ─── NOVAS FUNÇÕES: CreditCards ───

export const getCreditCards = () =>
  api.get<CreditCard[]>('/credit-cards/').then((r) => r.data)

export const getCreditCard = (id: number) =>
  api.get<CreditCard>(`/credit-cards/${id}`).then((r) => r.data)

export const createCreditCard = (data: CreditCardCreate) =>
  api.post<CreditCard>('/credit-cards/', data).then((r) => r.data)

export const updateCreditCard = (id: number, data: Partial<CreditCardCreate>) =>
  api.put<CreditCard>(`/credit-cards/${id}`, data).then((r) => r.data)

export const deleteCreditCard = (id: number) =>
  api.delete(`/credit-cards/${id}`)
```

**Regras do padrão:**
- GET retorna `.then((r) => r.data)` para extrair dados do Axios
- POST/PUT recebem `data` tipado
- DELETE retorna o AxiosResponse direto
- Rota usa o mesmo prefixo do backend: `/credit-cards/`

---

### 2.3 Criar a Página (componente React)

**Arquivo NOVO:** `frontend/src/pages/CreditCardsPage.tsx`

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCreditCards, createCreditCard, deleteCreditCard } from '../api/client'
import type { CreditCardCreate } from '../types'

const BRANDS = [
  { value: 'visa', label: 'Visa', icon: 'credit_card' },
  { value: 'mastercard', label: 'Mastercard', icon: 'credit_card' },
  { value: 'elo', label: 'Elo', icon: 'credit_card' },
  { value: 'amex', label: 'Amex', icon: 'credit_card' },
  { value: 'hipercard', label: 'Hipercard', icon: 'credit_card' },
]

export default function CreditCardsPage() {
  const queryClient = useQueryClient()

  // ── Buscar cartões do backend ──
  const { data: cards } = useQuery({
    queryKey: ['credit-cards'],           // Chave única para cache
    queryFn: () => getCreditCards(),       // Função que chama a API
  })

  // ── Estado do formulário ──
  const [form, setForm] = useState<CreditCardCreate>({
    name: '',
    last_four: '',
    brand: 'visa',
    credit_limit: 0,
    closing_day: 1,
    due_day: 10,
  })

  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ── Mutations (criar/deletar) ──
  const createMutation = useMutation({
    mutationFn: () => createCreditCard(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      // Invalida também as transações (gasto fixo foi criado)
      queryClient.invalidateQueries({ queryKey: ['transactions-grouped'] })
      setForm({ name: '', last_four: '', brand: 'visa', credit_limit: 0, closing_day: 1, due_day: 10 })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCreditCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      setDeletingId(null)
    },
  })

  // ── Formatação de moeda ──
  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  // ── Handler do formulário ──
  const updateField = <K extends keyof CreditCardCreate>(key: K, value: CreditCardCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = () => {
    if (form.name.trim() && form.last_four.length === 4) {
      createMutation.mutate()
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ═══ Header ═══ */}
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Cartões de Crédito</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Gerencie seus cartões. Ao cadastrar, um gasto fixo é criado automaticamente.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Formulário ── */}
        <div className="lg:col-span-1 bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">add_card</span>
            Novo Cartão
          </h3>

          {/* Nome */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">Nome do Cartão</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Ex: Nubank Platinum"
              className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-[#3f3f46]"
            />
          </div>

          {/* Últimos 4 dígitos */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">Últimos 4 Dígitos</label>
            <input
              type="text"
              maxLength={4}
              value={form.last_four}
              onChange={(e) => updateField('last_four', e.target.value.replace(/\D/g, ''))}
              placeholder="1234"
              className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-[#3f3f46]"
            />
          </div>

          {/* Bandeira */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">Bandeira</label>
            <div className="grid grid-cols-3 gap-2">
              {BRANDS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => updateField('brand', b.value)}
                  className={`py-2 rounded-lg text-xs font-medium transition-all ${
                    form.brand === b.value
                      ? 'border-2 border-primary bg-primary/10 text-primary'
                      : 'bg-[#18181b] border border-outline-variant text-on-surface-variant hover:border-primary'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Limite */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">Limite de Crédito</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-semibold text-sm">R$</span>
              <input
                type="number"
                step="0.01"
                value={form.credit_limit || ''}
                onChange={(e) => updateField('credit_limit', parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 pl-12 pr-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-[#3f3f46]"
              />
            </div>
          </div>

          {/* Dias */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">Fechamento</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.closing_day}
                onChange={(e) => updateField('closing_day', parseInt(e.target.value) || 1)}
                className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">Vencimento</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.due_day}
                onChange={(e) => updateField('due_day', parseInt(e.target.value) || 1)}
                className="w-full bg-[#09090b] border border-outline-variant rounded-lg py-3 px-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          {/* Botão */}
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || form.last_four.length !== 4 || createMutation.isPending}
            className="w-full bg-primary hover:bg-primary-container text-on-primary font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed mt-2"
          >
            <span className="material-symbols-outlined text-sm">add_card</span>
            {createMutation.isPending ? 'Cadastrando...' : 'Cadastrar Cartão'}
          </button>
        </div>

        {/* ── Lista de Cartões ── */}
        <div className="lg:col-span-2 bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant bg-surface-container-high/50 flex justify-between items-center">
            <h4 className="text-sm font-semibold text-on-surface">Meus Cartões</h4>
            <span className="text-xs text-on-surface-variant">
              {cards?.length ?? 0} cartõ{cards?.length === 1 ? 'es' : 'es'}
            </span>
          </div>

          <div className="divide-y divide-outline-variant">
            {cards && cards.length > 0 ? (
              cards.map((card) => (
                <div key={card.id} className="flex items-center justify-between p-4 hover:bg-[#18181b]/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-8 rounded-md bg-[#18181b] flex items-center justify-center text-primary border border-outline-variant">
                      <span className="material-symbols-outlined text-xl">credit_card</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">{card.name}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        •••• {card.last_four} · {card.brand.toUpperCase()} · Fecha dia {card.closing_day} · Vence dia {card.due_day}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-on-surface">{fmt(card.credit_limit)}</p>
                      <p className="text-[10px] text-on-surface-variant">limite</p>
                    </div>
                    {deletingId === card.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteMutation.mutate(card.id)}
                          className="px-3 py-1.5 text-xs font-bold bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1.5 text-xs text-on-surface-variant rounded-lg hover:bg-[#18181b] transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(card.id)}
                        className="p-2 text-on-surface-variant/40 hover:text-error transition-colors rounded-lg hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-on-surface-variant text-sm">
                <span className="material-symbols-outlined text-4xl mb-2 block opacity-30">credit_card_off</span>
                Nenhum cartão cadastrado
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Regras do padrão:**
- `useQuery` para buscar dados (com `queryKey` única)
- `useMutation` para criar/deletar (com `invalidateQueries` no `onSuccess`)
- `queryClient` para invalidar cache após mutações
- Estilo: Obsidian Dark (bg-surface-container, border-outline-variant, text-primary, etc.)
- Confirmação antes de deletar
- Estado local com `useState` para formulário
- Feedback visual: loading, disabled, confirmação

---

### 2.4 Registrar a Rota no App.tsx

**Arquivo:** `frontend/src/App.tsx`

Três alterações:

```tsx
// 1. Adicionar import (no topo)
import CreditCardsPage from './pages/CreditCardsPage'

// 2. Adicionar item de navegação (no array navItems)
const navItems = [
  { to: '/', label: 'Painel', icon: 'dashboard' },
  { to: '/expenses', label: 'Gastos', icon: 'shopping_cart' },
  { to: '/transactions', label: 'Transações', icon: 'receipt_long' },
  { to: '/credit-cards', label: 'Cartões', icon: 'credit_card' },     // ← NOVO
  { to: '/import', label: 'Orçamentos', icon: 'account_balance_wallet' },
  { to: '/reports', label: 'Relatórios', icon: 'analytics' },
  { to: '/salary', label: 'Rendimentos', icon: 'trending_up' },
  { to: '/settings', label: 'Configurações', icon: 'settings' },
]

// 3. Adicionar rota (dentro do <Routes>)
<Route path="/credit-cards" element={<CreditCardsPage />} />

// 4. Adicionar breadcrumb (no objeto BREADCRUMBS)
'/credit-cards': 'Cartões de Crédito',
```

---

## PASSO 3 — VERSIONAMENTO

Após testar e verificar que tudo funciona:

```bash
# 1. Ver o que mudou
git status

# 2. Adicionar APENAS os arquivos da feature
git add \
  backend/app/models.py \
  backend/app/schemas.py \
  backend/app/routers/credit_cards.py \
  backend/app/main.py \
  frontend/src/types/index.ts \
  frontend/src/api/client.ts \
  frontend/src/pages/CreditCardsPage.tsx \
  frontend/src/App.tsx

# 3. Commit com mensagem descritiva
git commit -m "feat: cadastro de cartões de crédito com gasto fixo automático

- Cria model CreditCard no banco (nome, bandeira, limite, fechamento, vencimento)
- Adiciona endpoints CRUD em /api/credit-cards
- Ao cadastrar cartão, cria transação recorrente automática nos gastos fixos
- Nova tela CreditCardsPage com formulário e lista de cartões
- Navegação atualizada com item Cartões no sidebar

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# 4. Enviar ao GitHub
git push origin master
```

---

## Resumo — Checklist de Implementação

```
BACKEND:
  □ models.py      → Nova classe (tabela do banco)
  □ schemas.py     → Create + Update + Out (validação)
  □ routers/X.py   → Endpoints CRUD (GET, POST, PUT, DELETE)
  □ main.py        → import + include_router

FRONTEND:
  □ types/index.ts → Interface TypeScript
  □ api/client.ts  → Funções Axios (get, create, update, delete)
  □ pages/X.tsx    → Componente React (useQuery + useMutation)
  □ App.tsx        → import + navItem + Route + breadcrumb

VERSIONAMENTO:
  □ git add        → Apenas arquivos da feature
  □ git commit     → "feat: descrição" + Co-Authored-By
  □ git push       → origin master
```

---

## Dicas Extras

1. **Não precisa criar migrations** — O `Base.metadata.create_all` cria tabelas automaticamente
2. **Invalidar queries relacionadas** — Se a feature afeta outra tela, invalide essas queries também
3. **Testar endpoint primeiro** — Abra `http://localhost:8000/docs` (Swagger) para testar a API antes de criar o frontend
4. **Seguir o Design System** — Sempre usar as cores do tema Obsidian (nunca cores hardcoded como `text-white`, use `text-on-surface`)
5. **Um commit por feature** — Nunca misture features diferentes no mesmo commit
