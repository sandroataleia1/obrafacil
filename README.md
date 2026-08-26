# ObraFácil

Monorepo do ObraFácil: frontend Next.js (`apps/web`) e backend Laravel (`apps/api`),
orquestrados via Docker Compose.

## Pré-requisitos

* [Docker](https://www.docker.com/) e Docker Compose (`docker compose`)
* [Node.js](https://nodejs.org/) 22+ e [pnpm](https://pnpm.io/) (apenas para rodar comandos fora do container)
* [PHP](https://www.php.net/) 8.4 e [Composer](https://getcomposer.org/) (apenas para rodar comandos fora do container)

Rodando tudo via Docker Compose, apenas Docker é estritamente necessário.

## Preparação do ambiente

1. Copie o arquivo de variáveis de ambiente da raiz:

   ```bash
   cp .env.example .env
   ```

2. Copie o arquivo de variáveis de ambiente da API:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

## Variáveis necessárias

### Raiz (`.env`)

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `WEB_PORT` | Porta do frontend no host | `3000` |
| `API_PORT` | Porta da API no host | `8000` |
| `POSTGRES_PORT` | Porta do PostgreSQL no host | `5432` |
| `REDIS_PORT` | Porta do Redis no host | `6379` |
| `NEXT_PUBLIC_API_URL` | URL pública da API usada pelo frontend | `http://localhost:8000` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Credenciais do banco | `obrafacil` |

### API (`apps/api/.env`)

Segue o padrão do Laravel. Os valores relevantes para o ambiente Docker já vêm
pré-configurados: `DB_CONNECTION=pgsql` (host `postgres`) e `REDIS_HOST=redis`
(cliente `predis`, sem dependência da extensão nativa `phpredis`).

## Como subir o projeto

```bash
make up
```

Isso constrói e sobe os serviços `web`, `api`, `postgres` e `redis` em background.

Outros comandos úteis:

```bash
make down     # para os serviços
make logs     # acompanha os logs de todos os serviços
make build    # reconstrói as imagens
make migrate  # roda as migrations do Laravel
```

## Como executar os testes

```bash
make test
```

Executa a suíte de testes do Laravel (`php artisan test`) dentro do container `api`.

## Portas utilizadas

| Serviço | Porta padrão |
| --- | --- |
| Web (Next.js) | 3000 |
| API (Laravel) | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Estrutura do repositório

```text
/
├── apps/
│   ├── web/              # Next.js (App Router, TypeScript, Tailwind, shadcn/ui)
│   └── api/               # Laravel 13 (PHP 8.4)
├── docs/
│   ├── architecture/
│   ├── decisions/         # Architecture Decision Records
│   ├── domain/
│   ├── calculations/
│   ├── api/
│   └── ux/
├── infrastructure/
│   └── docker/             # Dockerfiles de cada app
├── compose.yaml
├── Makefile
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

## Verificação do ambiente

* Frontend: `http://localhost:3000`
* Health check da API: `http://localhost:8000/api/v1/health` → `{"status":"ok"}`
