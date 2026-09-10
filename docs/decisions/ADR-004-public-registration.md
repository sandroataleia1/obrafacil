# ADR-004: Cadastro público (Company + Owner)

## Status

Aceito

## Contexto

[ADR-003](ADR-003-session-authentication.md) definiu login/logout/me/seleção
de empresa, mas nenhum fluxo público criava uma empresa nova. Esta ADR fecha
essa lacuna: o primeiro ponto de entrada de um cliente novo no ObraFácil.

## Decisão

* **`POST /api/v1/register`**, público, dentro do mesmo fluxo Sanctum SPA
  stateful (CSRF real no uso por navegador). Cria `Company` + `User` +
  `CompanyMembership(role=owner)` dentro de `DB::transaction()` — qualquer
  falha intermediária desfaz tudo, nunca deixando `User` sem `Company` ou
  `Company` sem owner.
* **Login automático**: após o commit, `Auth::guard('web')->login($user)` +
  `session()->regenerate()` + `ActiveCompanySession::set($company->id)`.
  Resposta usa `App\Support\MePayload` — o mesmo contrato de `/login` e
  `/me` — para não existirem três formatos de identidade.
* **Campos só do backend**: `company_id`, `role`, `active_company_id`,
  `created_by`, `id` nunca são lidos do payload — o controller só usa
  valores nomeados explicitamente (`$request->string('company_name')`, etc.)
  e `CompanyRole::Owner` é hardcoded, nunca vindo do cliente.
* **Já autenticado não registra de novo**: se `$request->user()` já resolve
  um usuário, `/register` responde `409` — criar uma segunda empresa para
  uma conta existente é feature futura separada, não este endpoint.
* **Telefone obrigatório e E.164** (`App\Rules\E164Phone`, mesma regra do
  BACKEND-02) — prepara o destinatário para o motor de notificações do
  BACKEND-03, mas **não** implica consentimento; isso será modelado como
  `NotificationPreference` própria, não um boolean solto em `users`.
* **Email duplicado**: validado via `unique` (UX), mas a autoridade real é o
  constraint do banco — uma violação de unicidade concorrente é capturada e
  remapeada para o mesmo `422` de validação, nunca um `500` cru.
* **Rate limit próprio** (`register`, 5/min por IP — não por email+IP como
  `login`, já que o objetivo é impedir criação automatizada de contas, não
  proteger uma conta existente).
* **Sem verificação de email** nesta rodada — registrado como hardening
  necessário antes de abertura pública ampla, não bloqueante para o piloto.
* **`companies.document` continua opcional** — CNPJ/CPF fica para
  Configurações da empresa, não no formulário inicial.

## Consequências

* Um usuário recém-registrado tem exatamente 1 membership (owner) e
  `requires_company_selection: false` — nunca a ambiguidade de múltiplas
  empresas tratada em ADR-003.
* `apps/web` não muda nesta rodada — a tela `/cadastro` fica para o gate
  `FRONTEND-AUTH-01`.
