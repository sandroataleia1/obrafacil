# ADR-006: Hardening do lifecycle de NotificationDelivery contra reenvio

## Status

Aceito

## Contexto

[ADR-005](ADR-005-notification-engine.md) estabeleceu o motor de
notificações, mas o job de envio decidia se podia chamar o provedor usando
apenas `NotificationDeliveryStatus::isTerminal()` — que só é verdadeiro para
`read`/`skipped` — e ignorava o retorno de `transitionTo(processing)`. Na
prática isso significava que uma delivery já `sent`, `delivered` ou `failed`
podia ser reenviada por um job antigo/duplicado/reprocessado, e que dois
workers concorrentes para a mesma delivery podiam ambos alcançar o provedor.
Esta ADR fecha essa lacuna antes de qualquer domínio real depender do motor.

## Decisão

* **"Terminal" ≠ "enviável"**: `NotificationDeliveryStatus::isSendable()` é
  um conceito novo e distinto de `isTerminal()`. `sent` não é terminal (o
  webhook ainda pode evoluí-lo para `delivered`/`read`), mas definitivamente
  não é enviável de novo. Apenas `queued` e o novo estado `retrying` são
  enviáveis.
* **Claim atômico via PostgreSQL**: `SendWhatsAppNotificationJob::
  claimDelivery()` faz `SELECT ... FOR UPDATE` dentro de uma
  `DB::transaction()`, verifica `isSendable()`, incrementa `attempts` e
  transiciona para `processing` — tudo antes de soltar o lock. O provedor só
  é chamado se essa transação retornar uma delivery não-nula. A autoridade
  está no banco, não em uma checagem `if ($model->status === ...)` fora de
  lock.
* **`attempts` só incrementa quando a execução vence o claim** — uma
  execução que encontra `sent`/`delivered`/`read`/`failed`/`skipped`, ou que
  perde a corrida para outro worker, nunca grava incremento.
* **Novo estado `retrying`**: um erro recuperável (conexão/timeout/5xx) move
  `processing → retrying` em vez de deixar a delivery presa em `processing`
  sem nenhuma tentativa de fato em andamento. A próxima execução (liberada
  pelo backoff do Laravel) faz um novo claim a partir de `retrying`, que
  volta a ser enviável.
* **`failed` nunca reenvia automaticamente** — preservado do ADR-005; a
  única via de volta a um estado enviável é `failed → queued` explícito
  (reprocessamento manual futuro).
* **Nunca**: `sent → processing`, `delivered → processing`, `read →
  processing`, `failed → processing`, `skipped → processing`. Codificado em
  `NotificationDeliveryStatus::canTransitionTo()`.
* **`ShouldBeUnique` como camada suplementar**: o job declara
  `uniqueId() = deliveryId` e `uniqueFor = 3600` (cobre toda a janela de
  backoff) para reduzir a chance de duas execuções do mesmo delivery serem
  sequer enfileiradas simultaneamente — mas o claim atômico no Postgres
  continua sendo a barreira real; nada depende exclusivamente do lock do
  Laravel.
* **Webhook: 0/1/>1 correspondências por `provider_message_id`** — a coluna
  é indexada, não única (não auditada contra a Evolution real ainda). O
  controller agora busca todas as correspondências: zero → `ignored 200`
  (como antes); exatamente uma → processa normalmente; mais de uma → **não
  atualiza nenhuma**, loga `evolution.webhook.ambiguous_message_id`
  (sanitizado, sem payload bruto) e responde `200` controlado. Nunca escolhe
  arbitrariamente via `first()`.
* **Timeout é ambiguamente documentado, não resolvido**: um timeout HTTP
  pode ocorrer depois de a Evolution já ter aceitado a mensagem. A
  `idempotency_key` local protege apenas o banco/fila do ObraFácil, não a
  operação remota — isso é aceito e documentado (`EvolutionApiProvider`),
  não fingido como resolvido. Fechar essa lacuna depende de o provedor real
  suportar um id de mensagem idempotente no lado dele, o que só o
  EVOLUTION-01 pode auditar.
* **`provider_instance` e correlação early-callback**: nenhuma coluna nova
  foi adicionada com base em suposição não verificada sobre o payload real
  da Evolution. Ambos os cenários (webhook chegando antes do
  `provider_message_id` ser persistido; necessidade de incluir a instance na
  chave de correlação) ficam documentados no `EvolutionWebhookController`
  como itens obrigatórios do EVOLUTION-01, não resolvidos aqui.

## Consequências

* `SendWhatsAppNotificationJobTest::test_j6_...` mudou de comportamento: o
  teste anterior resetava uma delivery `sent` diretamente para `queued` para
  simular um segundo ciclo — isso só era possível porque a regra de
  transição antiga permitia silenciosamente esse retrocesso e o job antigo
  ignorava o retorno de `transitionTo()`. Ambos eram exatamente o bug que
  esta rodada corrige. O teste agora usa o caminho de reprocessamento
  explícito real (`sent → failed → queued`) e adicionalmente prova que uma
  segunda execução sobre uma delivery já enviada não incrementa `attempts`
  nem chama o provedor.
* Nenhuma migration nova — nenhuma constraint de unicidade foi adicionada a
  `provider_message_id` (ainda não comprovadamente único) nem coluna
  `provider_instance` (estrutura do payload real não verificada).
* Concorrência real (dois workers) é exercida via chamadas sequenciais reais
  contra o mesmo lock do Postgres (`lockForUpdate()`), não mocks — isso
  prova o código de produção correto, mas não é literalmente paralelismo de
  threads, que o modelo de conexão única do PHPUnit não permite simular
  diretamente.
