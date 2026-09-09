# ADR-003: Autenticação por sessão (Sanctum SPA) e empresa ativa

## Status

Aceito

## Contexto

[ADR-002](ADR-002-multi-tenant-foundation.md) instalou o Sanctum apenas como
fundação e definiu a direção (cookie HttpOnly + sessão, não Bearer token no
frontend web), mas deixou login/logout/me para uma etapa própria. Esta ADR
implementa essa etapa e substitui a regra temporária de "primeira empresa do
usuário" por uma seleção explícita de empresa ativa.

## Decisão

* **Sanctum SPA, não token**: o frontend web nunca recebe nem armazena um
  Bearer token. O fluxo é `GET /sanctum/csrf-cookie` → `POST /api/v1/login`
  → cookie de sessão HttpOnly → `GET /api/v1/me`. `$middleware->statefulApi()`
  (em `bootstrap/app.php`) prepend `EnsureFrontendRequestsAreStateful` ao
  grupo `api`, ativando sessão/CSRF apenas para requisições cuja origem
  (`Referer`/`Origin`) bate com `SANCTUM_STATEFUL_DOMAINS`.
* **CORS com credenciais**: `config/cors.php` usa `supports_credentials: true`
  e `allowed_origins` lido de `FRONTEND_URL`/`FRONTEND_URLS` (env,
  comma-separated) — nunca `*` (incompatível com credentials) e nenhum domínio
  de cliente (JVW ou outro) hardcoded.
* **Login (`POST /api/v1/login`)**: `Auth::guard('web')->attempt()` +
  `session()->regenerate()` (previne session fixation). Falha de credencial
  retorna sempre a mesma mensagem genérica, sem revelar se o e-mail existe.
  Rate limit dedicado (`RateLimiter::for('login', ...)`, 5/min, chave
  `email normalizado|ip`) — excedido retorna `429`.
* **Logout (`POST /api/v1/logout`)**: `Auth::guard('web')->logout()` +
  `session()->invalidate()` + `session()->regenerateToken()`, limpando também
  `active_company_id` explicitamente.
* **`/me` (`GET /api/v1/me`)**: middleware `auth:sanctum` apenas — **nunca**
  `resolve-current-company`. Um usuário com múltiplas empresas precisa poder
  consultar `/me` antes de escolher qual ativar. Resposta nunca inclui
  `password`/`remember_token`.
* **Empresa ativa na sessão**: chave `active_company_id`, isolada em
  `App\Support\ActiveCompanySession` (get/set/forget), nunca em cookie
  próprio — vive dentro da sessão server-side.
* **Regra de login por quantidade de memberships**:
  - 0 memberships → credenciais podem ser válidas, mas o login termina em
    `403` e a sessão recém-criada é encerrada — nunca fica "meio autenticada".
  - 1 membership → login já autentica com a empresa ativa definida
    automaticamente.
  - >1 memberships → login autentica normalmente, mas `active_company_id`
    começa `null` e a resposta traz `requires_company_selection: true`.
    Nunca escolhida arbitrariamente (nem `first()`, nem "mais antiga", nem
    dono).
* **Seleção explícita de empresa (`POST /api/v1/companies/{company}/activate`)**:
  única exceção controlada à regra "`company_id` nunca vem do cliente" — o
  frontend informa qual empresa quer, o backend valida que o usuário
  autenticado tem membership nela antes de aceitar. `Company` não é
  tenant-scoped (não usa `BelongsToCompany`), então a rota não depende de
  route-model-binding implícito: a checagem de membership e o lookup do
  registro acontecem na mesma query, então "empresa não existe" e "empresa
  não é sua" retornam sempre `404`, sem diferença observável.
* **`ResolveCurrentCompany` atualizado** (substitui a versão do BACKEND-01A):
  1. limpa o contexto; 2. lê o usuário autenticado; 3. lê `active_company_id`
  da sessão; 4. valida que ainda é uma membership real; 5. define o contexto;
  6/7. `try/finally` garantindo limpeza mesmo em exceção. Se
  `active_company_id` aponta para uma empresa da qual o usuário não é mais
  membro (removido após a seleção), a sessão é limpa e o middleware
  **recalcula** a partir das memberships restantes (0 → 403, 1 → auto-resolve
  e persiste, >1 → 409) — nunca continua usando a empresa inválida.
* **Telefone (E.164)**: coluna `users.phone`, nullable, formato canônico
  (`+5511999999999`). Sem endpoint de escrita nesta rodada — o
  `users_phone_e164_check` (CHECK constraint no Postgres, criado na mesma
  migration que adiciona a coluna) é o ponto real de aplicação, não um
  validador de aplicação que poderia ser contornado por um futuro
  seeder/import. `App\Rules\E164Phone` existe como regra reutilizável para
  quando um endpoint de escrita (registro/perfil) for implementado.

## Consequências

* O frontend (`apps/web`) não muda nesta rodada — `demo-auth.ts` e
  `pilot-config.ts` continuam sendo a autenticação client-side temporária até
  um gate de integração dedicado.
* `personal_access_tokens` (tabela do Sanctum, publicada nesta rodada) usa
  `uuidMorphs('tokenable')`, não `morphs()` — `tokenable_id` precisa ser UUID
  para casar com `users.id`. Reservada para integrações futuras (mobile, API
  externa), não usada pelo fluxo web.
* Testes de autenticação rodam contra o Postgres real do stack isolado
  (`obrafacil_test`), nunca SQLite — descoberto neste round que
  `compose.yaml` injeta `APP_ENV`/`DB_*` como variáveis de ambiente reais do
  container, que `phpunit.xml` só consegue sobrescrever de fato via
  `<server ... force="true">` (não `<env>`, que não alcança `$_SERVER`).
* O handshake real de CSRF + cookie (incluindo o caso negativo) é validado
  por um smoke test HTTP real contra o container, não apenas pela suíte
  PHPUnit — `PreventRequestForgery` pula a verificação de CSRF
  automaticamente quando `runningUnitTests()` é verdadeiro, então PHPUnit
  sozinho nunca provaria a proteção real.
