# Obsidian Finance

App fullstack de gestão financeira pessoal com tema dark "Obsidian". Controla transações, importa extratos bancários (PDF/CSV) e faturas de cartão com categorização por IA (Claude), calcula rendimentos com INSS/IRRF e exibe dashboards com gráficos.

> Documentação completa de arquitetura, modelos e endpoints em [CLAUDE.md](CLAUDE.md).

## Tech Stack

- **Backend:** FastAPI · SQLAlchemy 2.0 (async) · PostgreSQL (asyncpg) · Pydantic v2 · Anthropic Claude API · pdfplumber · docling
- **Frontend:** React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · TanStack React Query · React Router v7 · Recharts

## Pré-requisitos

- Python 3.11+
- Node.js 20+
- PostgreSQL 14+ rodando localmente

## Setup

### 1. Banco de dados

Crie o banco no PostgreSQL:

```sql
CREATE DATABASE finance_app;
```

As tabelas são criadas automaticamente na primeira execução do backend (via `create_all` + migrações inline no `lifespan`).

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS
pip install -r requirements.txt
```

Copie o arquivo de exemplo de variáveis de ambiente e preencha os valores:

```bash
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/macOS
```

Variáveis (ver [backend/.env.example](backend/.env.example)):

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DATABASE_URL` | URL de conexão async com o PostgreSQL | `postgresql+asyncpg://postgres:postgres@localhost:5432/finance_app` |
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic (categorização por IA) | _(vazio)_ |

> Sem `ANTHROPIC_API_KEY` o app roda, mas a categorização automática de importações fica indisponível.

Rode o servidor:

```bash
uvicorn app.main:app --reload
```

API em `http://localhost:8000` · docs interativas em `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App em `http://localhost:5173` (o Vite faz proxy de `/api` → `localhost:8000`).

## Atalhos (Windows)

| Script | Ação |
|--------|------|
| `start.bat` | Sobe backend e frontend em dois terminais |
| `stop.bat` | Encerra os servidores |
| `reload.bat` | Reinicia os servidores |

## Estrutura

```
finance-app/
├── backend/    # FastAPI (app/main.py, models, schemas, routers/, services/)
├── frontend/   # React + Vite (src/pages, components, api/client.ts)
└── CLAUDE.md   # Documentação detalhada do projeto
```

## Testes (backend)

```bash
cd backend
venv\Scripts\activate
pytest
```
