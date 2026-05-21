# Escalas Plus

Sistema de gestão de escalas, voluntários e eventos para igrejas. Inclui painéis por perfil, trocas de escala, tarefas, check-in, notificações (in-app e WhatsApp), cadastro público com validação e três ambientes isolados (teste, homologação e produção).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Node.js 20, Express, TypeScript |
| Banco | PostgreSQL 15 |
| Auth | JWT, OTP (e-mail/WhatsApp), Google OAuth |
| WhatsApp | Baileys (somente admin geral) |
| Infra local | Docker Compose |

## Perfis de acesso

| Papel | Descrição |
|-------|-----------|
| `super_admin` | Admin geral — todas as igrejas, WhatsApp, homologação, igrejas |
| `admin` | Administrador da igreja |
| `lider` | Líder de departamento |
| `voluntario` | Voluntário — escalas, trocas, tarefas, perfil |

## Ambientes

O projeto suporta **três modos**, cada um com banco PostgreSQL próprio:

| Modo | Variável | Banco | Faixa no app |
|------|----------|-------|----------------|
| **Teste** | `teste` | `escalas_teste` | Vermelha — dados fictícios e seeds |
| **Homologação** | `hml` | `escalas_hml` | Âmbar — espelho de produção, não oficial |
| **Produção** | `prod` | `escalas_prod` | Sem faixa |

- **Teste**: migrations completas, usuários demo e ciclo de testes automático.
- **Homologação / Produção**: sem dados fictícios; apenas super admins iniciais até haver cadastros reais.
- **Cópia prod → hml**: no admin geral, aba **Homologação**, com backend em `APP_MODE=prod` — substitui todo o banco `escalas_hml` pela cópia atual de `escalas_prod`.

## Estrutura do repositório

```
escalas-plus/
├── backend/          # API Express + migrations SQL
│   └── src/
│       ├── database/ # tables, patches, inserts, seeds
│       ├── routes/
│       └── services/
├── frontend/         # Next.js (pages router)
├── docker/
│   └── postgres/init/  # criação dos 3 bancos na 1ª subida do Postgres
├── docker-compose.yml
└── README.md
```

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose
- [Node.js](https://nodejs.org/) 20+ (desenvolvimento local do frontend)
- Git

## Início rápido (Docker)

### 1. Variáveis de ambiente

```bash
cp backend/.env.example backend/.env
```

Ajuste `JWT_SECRET` em produção. O `.env` **não** é versionado.

### 2. Subir banco + backend (teste)

```bash
docker compose up -d
```

- Postgres: `localhost:5432`
- API (teste): `http://localhost:3001/api`

### 3. Frontend

```bash
cd frontend
npm install
```

Crie `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_MODE=teste
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
npm run dev
```

Acesse: **http://localhost:3000**

### 4. Rebuild após mudanças no backend

```bash
docker compose build backend
docker compose up -d backend
```

## Outros backends (Docker profiles)

| Ambiente | Comando | Porta API |
|----------|---------|-----------|
| Homologação | `docker compose --profile hml up -d backend-hml` | 3002 |
| Produção | `docker compose --profile prod up -d backend-prod` | 3003 |

Exemplos de frontend (copie para `.env.local`):

- `frontend/.env.hml.example` → API na porta **3002**, `NEXT_PUBLIC_APP_MODE=hml`
- `frontend/.env.prod.example` → API na porta **3003**, `NEXT_PUBLIC_APP_MODE=prod`

## Usuários de teste (APP_MODE=teste)

Senha padrão dos usuários fictícios: **`Test@1234`**

| E-mail | Papel |
|--------|-------|
| `super@escalas.com` | Super admin |
| `admin@escalas.com` | Super admin (Admin Escalas) |
| `lider@escalas.com` | Líder |
| `voluntario@escalas.com` | Voluntário |
| `admin-igreja1@escalas.com` | Admin igreja 1 |
| `admin-igreja2@escalas.com` | Admin igreja 2 |

Usuários do ciclo fechado de testes: `ciclo.louvor.ig{n}@`, `ciclo.volA.ig{n}@`, etc. (ver logs do backend na subida).

## Desenvolvimento local (sem Docker no backend)

Com Postgres acessível (Docker só do `db` ou instalação local):

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm run dev
```

Migrations e seeds rodam automaticamente na inicialização do backend.

## WhatsApp (admin geral)

1. Login como super admin.
2. Menu **WhatsApp** → escanear QR Code.
3. **Sincronizar grupos** e marcar quais recebem **notificações gerais**.

Mensagens usam o cabeçalho `*Notificações Bot Escalas Plus*` e links com login automático (token ~5 dias).

**Notificações gerais (grupos):** eventos, tarefas sem responsável, trocas confirmadas.  
**Individuais:** atribuição de escala/tarefa, cadastro pendente, escalas/trocas pendentes.

Sessão Baileys fica em `backend/data/whatsapp-auth` (ignorado pelo Git).

## Autenticação

- Login por **e-mail ou telefone** + senha → código **2FA** (canal definido no cadastro: e-mail ou WhatsApp).
- **Cadastro público** com validação por código (OTP).
- **Google**: configure `GOOGLE_CLIENT_ID` (backend) e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend) no [Google Cloud Console](https://console.cloud.google.com/).
- **Link mágico**: rota `/auth/entrar?token=...` para abrir telas direto da notificação.

Em desenvolvimento, códigos OTP de e-mail aparecem no **console do backend** (`[DEV] Código...`).

## Homologação (admin geral)

Rota: **Organização → Homologação**

- Visível para `super_admin`.
- Botão **Substituir homologação pela produção** só com:
  - `NEXT_PUBLIC_APP_MODE=prod` no frontend
  - `APP_MODE=prod` e `DB_NAME=escalas_prod` no backend de produção

A operação **apaga** `escalas_hml` e recria com dump integral de `escalas_prod`.

## Variáveis principais

### Backend (`backend/.env`)

| Variável | Descrição |
|----------|-----------|
| `APP_MODE` | `teste` \| `hml` \| `prod` |
| `DB_NAME` | Banco da instância atual |
| `DB_NAME_PROD` / `DB_NAME_HML` | Nomes para sync prod→hml |
| `JWT_SECRET` | Chave dos tokens JWT |
| `FRONTEND_URL` | Base dos links em notificações |
| `WHATSAPP_AUTH_DIR` | Pasta da sessão Baileys |
| `GOOGLE_CLIENT_ID` | Validação do login Google |

### Frontend (`frontend/.env.local`)

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | URL da API (ex.: `http://localhost:3001/api`) |
| `NEXT_PUBLIC_APP_MODE` | `teste` \| `hml` \| `prod` (faixa e comportamento UI) |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | OAuth Google (opcional) |

## Scripts úteis

```bash
# Backend
cd backend && npm run build && npm start

# Frontend
cd frontend && npm run build && npm start

# Logs do container
docker logs escalas-plus-backend-1 -f
```

## Segurança

- Nunca commite `.env` ou `frontend/.env.local` (use os arquivos `*.example`).
- Troque `JWT_SECRET` e senhas do Postgres em produção.
- O sync prod→hml é destrutivo no banco de homologação — use apenas com confirmação consciente.

## Licença

Projeto privado — definir licença conforme política da organização.
