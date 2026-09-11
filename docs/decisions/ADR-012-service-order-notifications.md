# ADR-012: Notificações de Ordem de Serviço

## Status

Aceito

## Contexto

ADR-011 (§"Integração com o motor de notificações — adiada") deixou
explicitamente registrado que BACKEND-06 é puramente transacional — zero
`NotificationEvent`/`NotificationDelivery`/job/chamada à Evolution API — e
que a integração real seria escopo de um gate futuro, com a régua já
fixada: esse gate futuro não pode chamar provider externo de dentro de
uma transaction. Este ADR fecha essa dívida.

O Notification Engine (ADR-005/006/007) já existe e é completo: os 9
event types de `ServiceOrder` já estavam registrados em
`NotificationEventType` desde BACKEND-06 (vocabulário, não implementação);
`NotificationDispatcher` já resolve deduplicação via constraint real
(`(company_id, deduplication_key)` único), opt-in explícito
(`whatsapp_enabled` + `NotificationPreference` por evento), e já despacha
`SendWhatsAppNotificationJob` com `->afterCommit()`; `QuietHoursService`
já é a autoridade de horário de silêncio. Nada disso foi duplicado aqui.

## Decisão

### Destinatário é sempre usuário interno da empresa

* O motor de notificação já resolve destinatários exclusivamente entre
  `Company::users()` — nenhum resolver novo foi criado. Isso significa,
  por construção, que `Customer.phone`/`CustomerContact.phone`/
  `CustomerContact.whatsapp` **nunca** são usados como destinatário de
  envio automático. Comunicação com o cliente final é um domínio
  distinto, que vai exigir consentimento e contrato próprios — segue
  fora de escopo.

### Fronteira after-commit

* `App\ServiceOrders\Notifications\ServiceOrderNotificationBridge` é a
  única coisa que `ServiceOrderService` conhece sobre notificações — ele
  nunca chama `NotificationDispatcher`/`SendWhatsAppNotificationJob`/
  `EvolutionApiProvider` diretamente, e o inverso também nunca acontece
  (controller/provider não se enxergam).
* `ServiceOrderNotificationBridge::queue()` monta o payload **dentro** da
  transação (usando a instância `ServiceOrder` recém-mutada e o
  `CurrentCompanyContext` ainda ativo), mas só chama
  `NotificationDispatcher::dispatch()` de dentro de um callback
  `DB::afterCommit()`. Isso preserva integralmente o ganho de
  BACKEND-06B: o lock pessimista da `ServiceOrder` (`FOR UPDATE`) nunca
  fica aberto enquanto um dispatch de notificação roda — o callback só
  executa depois que a transação (e portanto o lock) já foi liberada.
* Falha dentro do callback (ex.: uma falha transitória do
  `NotificationDispatcher`) é capturada e logada
  (`Log::error('service_order notification dispatch failed', [...])`) —
  a O.S. já está commitada nesse ponto, então a falha nunca vira erro
  HTTP para o usuário nem sugere que a operação de negócio falhou.
* Se a transação de negócio sofre rollback (ex.: item inválido em
  `create()`), o callback registrado simplesmente nunca executa — é o
  próprio comportamento nativo do `DB::afterCommit()` do Laravel, testado
  explicitamente (`NC7`, `NS8`).

### Reconciliação periódica

* `App\Console\Commands\ServiceOrderNotificationScanner`
  (`notifications:service-orders`) é o mecanismo de segunda chance: para
  cada Company, reconcilia `created`/`scheduled`/`started`/`completed`/
  `cancelled` a partir unicamente de colunas persistidas
  (`created_at`/`scheduled_start_at`/`started_at`/`completed_at`/
  `cancelled_at`), nunca de um histórico reconstruído. Antes de chamar o
  bridge, o comando faz um `exists()` barato contra
  `notification_events.deduplication_key` — uma O.S. já reconciliada
  custa uma SELECT indexada por scan, não uma tentativa de insert.
* Isso significa que uma falha do callback imediato nunca é perda
  permanente — o próximo scan (a cada 5 minutos) recupera o evento
  ausente, usando exatamente a mesma chave de deduplicação que o bridge
  usaria.

### Deduplicação determinística

* Toda chave segue o formato `service_order:{id}:{evento}` (lifecycle) ou
  `service_order:{id}:{evento}:{scheduled_start_at_iso}` (agendamento/
  lembretes) — centralizado em
  `App\ServiceOrders\Notifications\ServiceOrderNotificationDedupKey`,
  usado tanto pelo bridge quanto pelo scanner, para os dois caminhos
  nunca divergirem na mesma ocorrência.
* A constraint real `(company_id, deduplication_key)` em
  `notification_events` é a autoridade final — o bridge e o scanner só
  precisam ser *consistentes*, a unicidade em si é garantida pelo banco
  mesmo sob execuções concorrentes (duas chamadas simultâneas ao scanner,
  ou um `afterCommit` competindo com um scan).
* Mover uma O.S. de volta a um horário já notificado antes é, por
  política, deduplicado como se fosse o mesmo evento (nenhum "reagendado
  de novo" é emitido) — evita spam quando um usuário desfaz e refaz uma
  mudança de horário.

### `scheduled_start_at` é o único gatilho de `scheduled`

* Emitido quando a O.S. nasce com `scheduled_start_at`, ou quando um PUT
  muda esse valor para outro não-nulo. Reenviar o mesmo valor não emite
  nada novo; remover o agendamento (`null`) também não — não existe
  evento "unscheduled" no vocabulário atual, e nenhum foi inventado.

### Lembretes só se aplicam a `status=open`

* `due_tomorrow`/`due_today`/`due_2_hours`/`overdue` são consultados
  apenas entre O.S. `open` — uma vez `in_progress`, a semântica de "ainda
  vai começar" deixa de existir. Nenhuma mudança de status "cancela"
  lembretes já emitidos (eles já existem como `NotificationEvent`
  histórico), mas nenhum novo é gerado depois da transição.
* `due_today` exige `scheduled_start_at > now` — um horário já passado
  hoje produz apenas `overdue`, nunca um `due_today` "atrasado".
* `due_today` e `due_2_hours` são eventos independentes e podem coexistir
  para a mesma ocorrência.

### Timezone da empresa, nunca do servidor

* Todo texto de data/hora nas mensagens usa `Company.timezone`
  (`America/Sao_Paulo` por padrão) — nunca o timezone do processo PHP. O
  `NotificationMessageRenderer` continua com zero dependência de
  DB/Eloquent/Company (mesma decisão da ADR original do motor): ele só
  formata `payload['scheduled_start_at']` (instante ISO 8601) usando
  `payload['company_timezone']` (string), ambos já resolvidos por
  `ServiceOrderNotificationPayloadBuilder` no momento do dispatch.

### Bug real encontrado e corrigido: perda de offset em `scheduled_start_at`

* Descoberto pelos próprios testes deste gate (§NR3/NR9/NR10/NR13, os
  primeiros testes de todo o domínio de O.S. a combinar um
  `Company.timezone` não-UTC com um instante agendado real): o cast
  `datetime` do Eloquent (`HasAttributes::fromDateTime()`) formata um
  valor `Carbon` para gravação usando o timezone que o próprio objeto já
  carrega (`Y-m-d H:i:s`, sem offset) — nunca converte para UTC antes.
  Uma string de entrada com offset não-UTC (o formato literal que um
  timezone de cliente real produz, ex. `...-03:00`) tinha esse offset
  descartado na gravação; o PostgreSQL então reinterpretava os números
  "nus" usando o timezone da sessão (UTC), corrompendo o instante
  armazenado pela diferença do offset original. O mesmo padrão afetava a
  query do scanner (`where('scheduled_start_at', '<=', $tomorrowEnd)`)
  quando o limite superior ainda carregava o timezone da empresa.
* Corrigido em dois pontos, ambos já dentro de arquivos que este gate já
  alterava: `ServiceOrderService::normalizeSchedule()` converte
  `scheduled_start_at`/`scheduled_end_at` para UTC (`Carbon::parse($value)
  ->utc()`) antes de entrarem no array passado a `ServiceOrder::create()`/
  `fill()`; `ServiceOrderNotificationScanner::emitReminders()` chama
  `->utc()` no limite superior (`$tomorrowEnd`) antes de usá-lo como bind
  de query. Nenhum teste anterior (BACKEND-06/06B) pegou isso porque
  sempre usava instantes já-UTC (`now()`/`Carbon::now()` sem timezone
  explícito) — o bug só se manifesta com um offset não-zero de verdade.

### Scanner multi-tenant e paginado

* `ServiceOrderNotificationScanner` itera `Company::query()->chunkById()`
  e estabelece `CurrentCompanyContext::run($company, ...)` uma vez por
  empresa — nunca `ServiceOrder::withoutCompanyScope()`. As duas
  sub-varreduras (lembretes e reconciliação) usam `chunkById()` sobre
  `ServiceOrder`, nunca carregando todas as O.S. do sistema em memória de
  uma vez.
* Agendado em `routes/console.php` a cada 5 minutos, com
  `withoutOverlapping()` — o comando já é idempotente por construção
  (dedup determinística), a proteção é só para evitar trabalho
  desperdiçado, não para correção. O worker/scheduler de produção
  propriamente dito não é ligado nesta rodada (fase de deploy futura).

### Hardening do harness de concorrência (BACKEND-06B)

* `App\Console\Commands\ServiceOrderConcurrencyProbe` (o harness de teste
  de BACKEND-06B que manipula `ServiceOrder` diretamente por id/ação,
  sem autenticação/validação HTTP) agora recusa execução fora de
  `local`/`testing` (`FAILURE` com mensagem clara) — nunca é removido,
  pois `ServiceOrderConcurrencyTest` (CC1-CC12) continua dependendo dele
  para a prova real de concorrência PostgreSQL.

## Consequências

* Todo domínio futuro que precisar notificar a partir de uma mutação
  transacional tem, agora, um segundo exemplo completo (além do motor
  genérico original) do padrão "bridge fino + afterCommit + scanner de
  reconciliação" — reutilizável sem reinventar deduplicação, opt-in ou
  quiet hours.
* O bug de perda de offset de timezone corrigido aqui protege qualquer
  campo `datetime` futuro que receba um valor com offset não-UTC vindo de
  fora do processo — vale a pena revisar se outros domínios (ex.: um
  futuro `Payable.due_date`) precisam do mesmo cuidado ao introduzir
  timezone não-UTC pela primeira vez.
* A integração cliente/contato (WhatsApp para `Customer`/`CustomerContact`)
  permanece deliberadamente fora de escopo — precisa de consentimento e
  contrato de comunicação externa próprios antes de existir.
