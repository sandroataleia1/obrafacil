# ADR-005: Motor de notificações e fundação Evolution API (WhatsApp)

## Status

Aceito

## Contexto

Ordens de serviço, contas a pagar/receber, projetos, orçamentos, compras,
estoque, equipe e resumos diário/semanal vão precisar, cada um, de avisar
usuários por WhatsApp em algum momento futuro. Sem um ponto central, cada
domínio acabaria chamando a Evolution API diretamente, duplicando lógica de
consentimento, deduplicação, horário de silêncio e tratamento de erro de
provedor — e tornando impossível trocar de provedor sem tocar em todo o
código de domínio. Esta ADR estabelece essa fundação antes de qualquer
domínio real depender dela; nenhum evento de domínio é disparado nesta
rodada além de um tipo `system.test` usado apenas para prova de ponta a
ponta.

## Decisão

* **Cadeia obrigatória**: `Domain Event → NotificationDispatcher →
  NotificationSetting/NotificationPreference → NotificationDelivery →
  SendWhatsAppNotificationJob → WhatsAppProvider (interface) →
  EvolutionApiProvider`. Nenhum código de domínio pode chamar a Evolution
  API diretamente — sempre via `NotificationDispatcher::dispatch()`.
* **`WhatsAppProvider` é uma interface**, `EvolutionApiProvider` é a única
  implementação hoje. `AppServiceProvider` faz o bind; trocar de provedor
  no futuro é rebind, não uma varredura de call sites.
* **`WhatsAppSendResult`** encapsula o resultado do envio
  (`accepted`/`providerMessageId`/`rawStatus`) para que o parsing da
  resposta bruta do provedor (`data.key.id`, etc.) nunca vaze para fora do
  adapter.
* **Config privada via env**: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
  `EVOLUTION_INSTANCE`, `EVOLUTION_TIMEOUT_SECONDS`,
  `EVOLUTION_WEBHOOK_SECRET` — nunca `NEXT_PUBLIC_EVOLUTION_*` (o frontend
  jamais precisa dessas credenciais), nenhuma chave real neste repositório
  (`.env.example` só tem placeholders).
* **Timeout explícito e configurável**: `EvolutionApiProvider` recebe
  `timeoutSeconds` no construtor, nunca hardcoded. Erros de
  conexão/timeout/4xx/5xx/resposta inválida são exceções distintas
  (`WhatsAppConnectionException`, `WhatsAppTimeoutException`,
  `WhatsAppClientException`, `WhatsAppServerException`,
  `WhatsAppInvalidResponseException`) — nenhuma delas nunca inclui a API
  key na mensagem.
* **Fila via banco (`QUEUE_CONNECTION=database` fora de teste)**:
  `SendWhatsAppNotificationJob implements ShouldQueue`, sempre despachado
  com `->afterCommit()` (nunca antes da transação que criou a delivery
  commitar). Retry com backoff explícito e finito (`60, 300, 900, 3600`
  segundos, `tries = 5`) — nunca infinito. 4xx nunca é reprocessado
  (`$this->fail()` imediato); erros recuperáveis (conexão/timeout/5xx)
  propagam para o mecanismo de retry da fila.
* **Consentimento nunca é automático**: `notification_settings.
  whatsapp_enabled` tem default `false` — ter telefone cadastrado não
  implica opt-in. **"Sem preferência = sem envio"**: um destinatário só é
  elegível com `whatsapp_enabled = true` **e** uma linha explícita
  `enabled = true` em `notification_preferences` para aquele
  `(event_type, channel)` exato. Ausência de linha nunca é tratada como
  "habilitado por padrão".
* **Deduplicação por banco, não por aplicação**:
  `notification_events` tem `unique(company_id, deduplication_key)`;
  `notification_deliveries` tem `unique(company_id, idempotency_key)`
  (chave determinística `"{event.id}:{user.id}:whatsapp"`). O dispatcher
  tenta o insert e trata a violação de constraint — nunca confia em um
  `where()` prévio como única proteção contra corrida.
* **Snapshot, não referência**: `recipient` e `rendered_message` em
  `notification_deliveries` são gravados no momento do envio. Uma mudança
  posterior no telefone ou template do usuário nunca altera o que uma
  delivery já criada registra ter enviado.
* **Status como enum PHP, nunca enum de banco**: coluna `status` é string
  livre; `NotificationDeliveryStatus` (PHP) define a máquina de estados —
  avanço estrito por padrão (`queued < processing < sent < delivered <
  read`, podendo pular etapas), nunca regride, `read`/`skipped` são
  terminais, `failed` é alcançável de qualquer estado não-terminal mas só
  progride de novo via `failed → queued` explícito. Webhook duplicado é
  sempre idempotente (mesmo status → sucesso, no-op).
* **Horário de silêncio usa o fuso da própria empresa**
  (`companies.timezone`, default `America/Sao_Paulo`), nunca o fuso do
  servidor. Nunca descarta uma notificação durante o silêncio — atrasa
  (`->delay($nextAllowedTime)`) até o fim da janela.
* **Webhook autenticado por segredo, não Sanctum**:
  `POST /api/v1/webhooks/evolution` é machine-to-machine (a própria
  Evolution API chamando de volta), autenticado por
  `X-ObraFacil-Webhook-Secret` comparado via `hash_equals()` — usar
  Sanctum aqui não faria sentido (não há sessão de usuário do lado do
  provedor).
* **Multitenancy em job/webhook**: jobs não têm sessão HTTP, então
  `SendWhatsAppNotificationJob` estabelece `CurrentCompanyContext`
  explicitamente via `company_id` guardado no próprio job antes de tocar
  em qualquer model com `BelongsToCompany` — uma delivery de outra empresa
  nunca é lida (fail-closed pelo `CompanyScope`). O webhook é a única
  exceção documentada que usa `withoutCompanyScope()`, pois o lookup por
  `provider_message_id` precisa necessariamente cruzar tenants antes de
  saber a qual empresa a mensagem pertence.

## Consequências

* Nenhum domínio real (ordens de serviço, financeiro, etc.) foi alterado
  nesta rodada — `NotificationEventType` já lista os tipos futuros, mas
  apenas `system.test` é utilizável hoje, para prova de ponta a ponta.
* O formato exato do payload de request/response da Evolution API
  (`EvolutionApiProvider` e `EvolutionWebhookParser`) é uma melhor
  suposição documentada, **não auditada contra a instância real da VPS**
  — essa auditoria fica para uma rodada futura (EVOLUTION-01). Se o
  formato real divergir, apenas essas duas classes precisam mudar.
* Testes do provedor HTTP usam exclusivamente `Http::fake()` — nenhuma
  chamada real à rede em nenhum teste.
* Descoberto neste round: `QUEUE_CONNECTION=sync` (ambiente de teste) faz
  todo `dispatch()->afterCommit()` rodar de forma síncrona assim que a
  transação real commita — isso tornou possível testar
  commit/rollback/afterCommit com transações reais, mas também exigiu
  vincular um `FakeWhatsAppProvider` em todo teste do dispatcher que cria
  uma delivery elegível, senão o provedor real (`EvolutionApiProvider`)
  seria acionado de verdade contra config de teste vazia.
* Descoberto neste round: capturar uma `QueryException` de violação de
  constraint única dentro de uma transação Postgres ativa não limpa o
  estado da transação — todo `INSERT`/`UPDATE` seguinte falha com
  `current transaction is aborted` até um `ROLLBACK`/`ROLLBACK TO
  SAVEPOINT` real. `NotificationDispatcher::createEventOrNull()` isola o
  insert arriscado em uma `DB::transaction()` aninhada (savepoint real do
  Postgres) para que o catch não envenene a transação externa do
  dispatch.
