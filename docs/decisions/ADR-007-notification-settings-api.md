# ADR-007: API de configurações e preferências de notificação

## Status

Aceito

## Contexto

O motor de notificações ([ADR-005](ADR-005-notification-engine.md),
[ADR-006](ADR-006-notification-delivery-lifecycle-hardening.md)) já sabe
decidir se envia ou não com base em `notification_settings` e
`notification_preferences`, mas nada até agora permitia ao próprio usuário
ler ou escrever essas linhas. Esta ADR expõe `GET`/`PUT
/api/v1/notifications/settings`, consumida no próximo gate
(NOTIFICATIONS-UI-01). Nenhuma alteração de configuração pode, por si só,
enviar mensagem.

## Decisão

* **Identidade implícita**: a configuração pertence sempre a (usuário
  autenticado, empresa ativa). Não existe `user_id`/`company_id` na rota
  nem no payload — são campos `prohibited` explicitamente, não apenas
  ignorados — tornando "editar configuração de outro usuário" uma
  superfície estruturalmente inexistente, não apenas proibida por
  validação.
* **`GET` nunca escreve**: `NotificationSettingsService::effective()`
  monta a resposta a partir de uma linha `NotificationSetting` opcional +
  `Company`/`User` — nunca chama `create()`/`updateOrCreate()`. Sem
  configuração salva, a resposta usa os defaults centralizados em
  `App\Notifications\Support\NotificationSettingsDefaults` (única fonte
  para esses valores — controller, resource, service e testes leem dali,
  nunca duplicam o literal `'21:00'` etc.).
* **`weekly_summary_*`**: nova migration adiciona `weekly_summary_enabled`
  (boolean, default false), `weekly_summary_day` (smallint nullable,
  ISO-8601 1-7) e `weekly_summary_time` (time nullable) a
  `notification_settings`, com `CHECK (weekly_summary_day IS NULL OR
  weekly_summary_day BETWEEN 1 AND 7)` — mesmo padrão do
  `users_phone_e164_check` já existente: o banco é a autoridade, não
  apenas a validação da aplicação. Nunca um enum Postgres.
* **`timezone` é somente leitura**: vem de `Company::timezone` e é
  `prohibited` no payload de `PUT` — edição do timezone da empresa fica
  para uma futura configuração de empresa; o motor de notificações
  continua usando `company.timezone` sem mudança.
* **`recipient_phone`/`can_enable_whatsapp`**: `recipient_phone` é sempre
  `$request->user()->phone`, nunca editável aqui. `can_enable_whatsapp`
  reflete se esse telefone passa na mesma validação E.164
  (`App\Rules\E164Phone`) usada pela constraint do banco. Tentar
  `whatsapp_enabled=true` sem telefone válido é `422` — nunca persiste o
  estado inconsistente `whatsapp_enabled=true` + `phone=null`.
* **Registry** (`NotificationEventType`): adicionados
  `service_order.scheduled`, `service_order.due_2_hours`,
  `service_order.started`, `service_order.cancelled` (vocabulário do
  roadmap de OS, nenhum domínio novo implementado). Dois métodos novos:
  `isUserConfigurable()` (falso para `system.test` e os dois `summary.*`)
  e `group()` (segmento antes do primeiro `.` no value do enum — sem
  rótulos em português, isso é decisão do frontend).
* **`summary.daily`/`summary.weekly` nunca são uma preference genérica**
  (§18): controlados exclusivamente por `daily_summary_enabled` /
  `weekly_summary_enabled`. Permitir também como entrada em `preferences`
  criaria duas fontes de verdade que poderiam divergir — por isso
  `isUserConfigurable()` os exclui e a `NotificationSettingsRequest`
  rejeita (`422`) qualquer tentativa de enviá-los ali.
* **"Omisso = false" no PUT** (§22): como o `PUT` é sempre um snapshot
  completo, o `GET` sempre devolve todos os event types configuráveis
  (hoje 26) com `enabled=false` quando não há linha —
  `NotificationDispatcher` já tratava "sem preferência = sem envio" da
  mesma forma; este endpoint só torna esse estado visível.
* **Upsert real, não `exists()`→`insert()`** (§21): `save()` usa
  `Model::upsert()` (Postgres `INSERT ... ON CONFLICT DO UPDATE`) tanto
  para `notification_settings` (`uniqueBy: [company_id, user_id]`) quanto
  para `notification_preferences` em lote (`uniqueBy: [company_id,
  user_id, event_type, channel]`) — a autoridade contra duplicação é a
  constraint do Postgres, nunca uma checagem prévia em PHP. Como
  `upsert()` contorna os eventos do Eloquent (o `creating` hook que
  normalmente força `company_id`), o `company_id` é passado explicitamente
  em cada linha a partir da `Company` já resolvida pelo
  `CurrentCompanyContext`.
* **Atomicidade**: `save()` roda inteiro dentro de uma `DB::transaction()`
  — se a etapa de preferences falhar, a escrita de settings é revertida
  junto (provado em A2 forçando uma falha real de banco, não só um erro de
  validação).
* **PUT nunca notifica** (§28): não há nenhuma chamada a
  `NotificationDispatcher`, `NotificationEvent::create()`, nem dispatch de
  `SendWhatsAppNotificationJob` em todo o caminho do `PUT` — provado
  explicitamente (`Bus::fake()`/`Queue::fake()` + contagem zero de
  `NotificationEvent`/`NotificationDelivery`).
* **Contrato de resposta sem envelope `data`**: `NotificationSettingsResource`
  define `public static $wrap = null;` — o padrão do Laravel envolveria a
  resposta em `{"data": {...}}`, o que quebraria o contrato documentado em
  §4.
* **Controller fino**: `NotificationSettingsController` só orquestra
  `CurrentCompanyContext::get()` + `NotificationSettingsService`; toda a
  montagem de defaults/catálogo vive no service, nunca no controller.

## Consequências

* Nenhum domínio real (Service Order, Payable, etc.) foi implementado —
  os quatro novos event types de OS são vocabulário, não funcionalidade.
* Nenhum scheduler foi criado para `summary.daily`/`summary.weekly` — os
  campos `daily_summary_enabled`/`weekly_summary_enabled` são apenas
  configuração de agenda nesta rodada; a geração real do resumo é um gate
  futuro dedicado.
* `apps/web` não foi tocado — a tela consumidora é NOTIFICATIONS-UI-01.
* Descoberto durante o smoke real: o container de desenvolvimento já
  existente (não o `obrafacil_test` de CI) precisa de `php artisan
  migrate` explícito após uma nova migration ser adicionada em uma sessão
  de trabalho já em andamento — a suíte PHPUnit roda migrations frescas a
  cada execução, mas o banco de desenvolvimento persistente do container
  não se atualiza sozinho. Isso não é um bug do código, é uma etapa manual
  de qualquer fluxo de trabalho local com container de longa duração.
