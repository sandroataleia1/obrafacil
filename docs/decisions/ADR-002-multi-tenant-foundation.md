# ADR-002: Fundação multiempresa (multi-tenant)

## Status

Aceito

## Contexto

`apps/api` precisa suportar múltiplas empresas (tenants) isoladas entre si antes
de qualquer domínio de negócio real (Customer, CatalogItem, ServiceOrder) ser
implementado. Esta ADR complementa [ADR-001](ADR-001-architecture.md), que já
deferia autenticação e multi-tenancy para uma decisão futura.

## Decisão

* **Relação Company ↔ User**: N:N via tabela pivot `company_user`
  (model `CompanyMembership`), não uma FK direta `users.company_id`. Um usuário
  pode pertencer a mais de uma empresa; cada vínculo carrega uma `role`
  (`owner` | `admin` | `member`).
* **Identificadores**: `companies`, `users` e `company_user` usam UUID como
  chave primária (não bigint autoincrement) — reduz risco de enumeração
  sequencial entre tenants e já prepara o formato usado pelos domínios de
  negócio futuros.
* **Empresa ativa explícita**: nenhum model de negócio resolve a empresa ativa
  chamando `auth()->user()` diretamente. Existe um serviço dedicado,
  `App\Support\CurrentCompanyContext` (singleton), que guarda a empresa ativa
  da requisição/comando/job atual. Fora do contexto HTTP (testes, seeders,
  commands, jobs), o código usa `CurrentCompanyContext::run($company, fn () => ...)`
  para definir a empresa explicitamente durante a execução do callback.
* **Resolução em HTTP**: o middleware `App\Http\Middleware\ResolveCurrentCompany`
  roda depois de `auth:sanctum` e antes de qualquer model de negócio ser
  carregado via route model binding. Ele lê o(s) membership(s) do usuário
  autenticado e define a empresa ativa — nunca a partir de header, query
  string, body ou parâmetro de rota.
* **Fail closed**: `App\Models\Concerns\BelongsToCompany` (trait) +
  `App\Models\Scopes\CompanyScope` (global scope) filtram toda query por
  `company_id` da empresa ativa. Se não houver `CurrentCompanyContext` definido,
  a query lança exceção imediatamente — nunca retorna registros de todas as
  empresas.
* **`company_id` nunca vem do cliente**: ao criar um registro de um model com
  `BelongsToCompany`, `company_id` é sempre sobrescrito a partir do
  `CurrentCompanyContext` ativo, mesmo que o array de atributos tente definir
  outro valor (e mesmo que `company_id` não esteja em `$fillable`).
* **Autenticação web**: Sanctum é instalado apenas como fundação nesta etapa
  (trait `HasApiTokens` no `User`). A estratégia definida para o frontend web é
  **Sanctum SPA com cookie HttpOnly + sessão + CSRF**, não Bearer token em
  `localStorage`. Personal access tokens ficam reservados para integrações
  futuras (mobile, API externa). Login/logout/me completos ficam para uma
  próxima etapa (BACKEND-02).

## Consequências

* Toda tabela de negócio futura (Customer, CatalogItem, ServiceOrder, ...)
  adota `BelongsToCompany` e ganha isolamento de tenant automaticamente, sem
  precisar repetir `where('company_id', ...)` em cada query.
* Um lookup cross-tenant por UUID conhecido (ex.: empresa A tentando acessar um
  registro da empresa B) resulta em `404`, nunca `403` — não há vazamento de
  existência do registro.
* Testes de tenant isolation rodam obrigatoriamente contra PostgreSQL (não
  SQLite), pois etapas futuras dependem de UUID, locks e transações específicas
  do Postgres.
* Nenhuma tabela de negócio fictícia foi criada em `database/migrations` só
  para provar isolamento — o teste usa um model fixture (`FixtureWidget`) cuja
  migration vive em `tests/Fixtures/migrations`, fora do schema real.
