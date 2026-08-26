# ADR-001: Arquitetura inicial do ObraFácil

## Status

Aceito

## Contexto

O ObraFácil precisa de uma fundação técnica que suporte um produto mobile-first,
com separação clara entre apresentação e regras de negócio, permitindo evolução
independente do frontend e do backend.

## Decisão

* **Frontend**: Next.js (App Router) + React + TypeScript (strict) + Tailwind CSS + shadcn/ui,
  responsável exclusivamente pela apresentação e interação.
* **Backend**: Laravel 13 (PHP 8.4), autoridade única das regras de negócio, exposto como REST API.
* **Banco de dados**: PostgreSQL como banco principal.
* **Cache/filas**: Redis.
* **Organização**: monorepo (`apps/web`, `apps/api`), sem ferramenta de orquestração
  (Turborepo/Nx) nesta etapa — a coordenação é feita via `pnpm` workspaces e `Makefile`.
* **Comunicação**: REST API versionada (`/api/v1/...`), consumida pelo frontend via HTTP.
* **Abordagem de produto**: mobile-first.

## Consequências

* Não há compartilhamento de tipos entre PHP e TypeScript — cada lado define os seus,
  evitando acoplamento prematuro.
* A ausência de orquestrador de monorepo mantém a configuração simples; pode ser
  revisitada quando o número de pacotes justificar a complexidade adicional.
* Autenticação, multi-tenancy e PWA ficam fora do escopo desta decisão e serão
  tratados em ADRs futuras.
