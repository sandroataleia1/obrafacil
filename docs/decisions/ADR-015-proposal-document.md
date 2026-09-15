# ADR-015: Documento de proposta — snapshot histórico e PDF

## Status

Aceito

## Contexto

BUDGET-API-01/01A e COMPANY-PROFILE-API-01 já entregaram, separadamente,
o domínio de Orçamento (com sua própria captura histórica de Customer no
momento da criação) e o perfil comercial da Company (nome, razão social,
CNPJ, contato, endereço, logo — todos nullable). Faltava conectar os
dois: quando um Orçamento vira proposta (`draft` → `pending_approval`),
tudo que o cliente vê precisa congelar naquele instante — inclusive a
identidade da empresa que está vendendo, algo que BUDGET-API-01 nunca
tratou porque `CompanyProfileResource` ainda não existia.

Sem isso, qualquer PDF/proposta pública gerado a partir de um Orçamento
já enviado ficaria refém do estado *atual* da Company — um cliente
poderia reabrir uma proposta antiga meses depois e ver um nome, CNPJ ou
logo diferentes do que existiam no momento em que aceitou a oferta.

## Decisão

* **`company_snapshot` congela no submit, nunca antes, nunca depois**:
  um único `JSONB` em `budgets`, escrito exclusivamente dentro de
  `BudgetService::submit()`, nunca por mass-assignment de request
  (`Budget::$fillable` deliberadamente não inclui `company_snapshot`/
  `proposal_logo_path`/`proposal_template_version`) — a única forma de
  esses três campos existirem é a atribuição explícita dentro do
  submit. `App\Budgets\CompanyProposalSnapshotBuilder` é a ÚNICA fonte
  estrutural do shape do snapshot, reaproveitada tanto por
  `BudgetService::submit()` (persistido) quanto pelo preview autenticado
  de draft (construído a cada request, nunca persistido) — evita duas
  cópias divergentes do mesmo array shape.
* **Logo é cópia de arquivo, nunca snapshot de path**: `Company.logo_path`
  é mutável (`CompanyLogoService` apaga o arquivo antigo ao trocar/
  remover a logo) — apontar `proposal_logo_path` para o mesmo caminho
  quebraria documentos históricos assim que a Company trocasse de logo.
  `App\Budgets\BudgetProposalLogoService::copyFromCompany()` COPIA os
  bytes do arquivo atual para um caminho próprio e imutável do Budget
  (`companies/{companyId}/proposals/{budgetId}/{uuid}.{ext}`) — depois
  disso, nada que a Company faça ao seu próprio perfil (nem trocar, nem
  remover a logo) volta a tocar esse arquivo.
* **Sem logo é estado válido, arquivo ausente não é**: `Company.logo_path
  === null` nunca bloqueia submit (nenhum campo do perfil é obrigatório
  — decisão já tomada em COMPANY-PROFILE-API-01). Mas `logo_path` não
  nulo apontando para um arquivo que não existe mais no disco É um erro
  controlado (`ProposalLogoMissingException`, 422) — nunca um submit
  silencioso sem logo nesse caso, e nunca um Budget parcialmente
  atualizado: toda a transação do submit reverte, o Budget permanece
  `draft`.
* **Coerência sob concorrência via lock explícito na Company**:
  `submit()` faz `lockForUpdate()` na row da Company logo após travar o
  Budget e validar `draft` — serializa um `PUT /company/profile`
  concorrente contra o submit exatamente como `BudgetLocker` já
  serializa decisões concorrentes no próprio Budget. Provado com dois
  processos SO reais / conexões Postgres reais nas duas ordens possíveis
  (`ProposalSnapshotConcurrencyProbe`, `ProposalSnapshotConcurrencyTest`):
  o snapshot resultante é sempre 100% pré-atualização OU 100%
  pós-atualização, nunca uma mistura.
* **Filesystem não é transacional — cópia da logo tem compensação
  explícita**: se `$lockedBudget->save()` falhar depois da cópia (ex.:
  erro inesperado), o catch de `submit()` chama
  `BudgetProposalLogoService::deleteCopy()` no arquivo recém-criado antes
  de relançar a exceção — nunca deixa um arquivo órfão no disco quando o
  Budget continua `draft`.
* **`proposal_template_version` existe desde já, mesmo só havendo a v1**:
  gravado como `1` no submit, nunca inferido do "template mais recente".
  `ProposalPdfRenderer`/`ProposalDocumentDataBuilder` despacham por esse
  número via `match` explícito — uma versão desconhecida lança uma
  exceção, nunca cai silenciosamente no template mais novo. Isso permite
  uma v2 visual futura sem que qualquer proposta já enviada mude de
  aparência retroativamente.
* **Condições comerciais são client-facing; `notes` continua interno**:
  `valid_until`/`payment_terms`/`execution_terms`/`proposal_terms` são
  campos novos, editáveis somente enquanto `draft` (mesma trava que já
  protege título/referência/desconto), e aparecem tanto no PDF quanto no
  JSON público. `Budget.notes` nunca muda de sentido — continua de uso
  exclusivamente interno, nunca aparece em `PublicProposalResource` nem
  no PDF, e nunca foi reaproveitado como "Condições" apesar da
  proximidade semântica.
* **Preview de draft usa a Company viva; proposta enviada usa apenas o
  snapshot congelado**: `GET /budgets/{budget}/proposal-preview.pdf`
  (autenticado) ramifica em `ProposalDocumentDataBuilder` — para
  `draft`, monta o snapshot na hora a partir da Company/logo atuais
  (nunca persiste nada, nunca gera token); para `pending_approval`/
  `approved`/`rejected`, usa exclusivamente `company_snapshot`/
  `proposal_logo_path` já congelados — a MESMA fonte que
  `GET /proposals/{token}/pdf` (público) usa. Datas do documento também
  seguem essa mesma regra: um Budget enviado formata `submitted_at`/
  `decided_at` com o timezone congelado dentro do próprio snapshot,
  nunca o timezone atual da Company.
* **PDF gerado no servidor, `dompdf/dompdf` direto (sem wrapper
  Laravel)**: resolvido e instalado via Composer após um preflight real
  no worktree isolado (v3.1.6, compatível com PHP `^8.3`/Laravel
  `^13.17`). `ProposalDocumentDataBuilder` monta um `ProposalDocumentData`
  (DTO só-leitura) — a ÚNICA coisa que o Blade (`resources/views/
  proposals/pdf/v1.blade.php`) enxerga; o template nunca recebe o model
  `Budget`/`Company` cru, então campos sensíveis (custo, margem, notes,
  ids internos, `decision_note`, `proposal_logo_path` bruto) são
  estruturalmente impossíveis de vazar por ali, não apenas
  "esquecidos por engano".
* **Logo embarcada como base64, nunca URL remota**: o ambiente Docker
  local não tinha a extensão `gd` do PHP instalada — necessária pelo
  `dompdf` para processar qualquer imagem raster (PNG/JPEG/WebP)
  embutida, mesmo via data URI. Adicionada ao Dockerfile local
  (`infrastructure/docker/api/Dockerfile`, com suporte a WebP também,
  já que o upload de logo aceita esse formato) — uma mudança de
  infraestrutura 100% local, necessária para a feature funcionar de
  verdade neste ambiente, não uma alteração de VPS/produção. O renderer
  lê os bytes da logo via `Storage::disk('public')->get()` e embute como
  `data:` URI — nunca um `<img src="http://...">`, e
  `Options::setIsRemoteEnabled(false)` bloqueia qualquer tentativa de
  busca remota no HTML gerado.
* **Rate limit dedicado para o PDF público**: `proposal-pdf` (6/min por
  IP+token) — geração de PDF é CPU-cara e o endpoint é público; mais
  restritivo que `proposal-decisions` (10/min) de propósito. O preview
  autenticado não tem limiter dedicado (mesma política de todo o resto
  do domínio autenticado de Budget).
* **`BudgetResource.proposal_company` vs `PublicProposalResource.company`**:
  dois resources, mesma fonte (`company_snapshot` + `proposal_logo_path`
  derivando `logo_url`), formas quase idênticas — o interno existe para
  auditoria de quem criou o orçamento ver exatamente o que foi congelado
  e enviado; nenhum dos dois expõe `proposal_logo_path` bruto, só
  `logo_url` derivada, mesma disciplina de `CompanyProfileResource`.

## Consequências

* Nova dependência: `dompdf/dompdf` `^3.1` (composer.json/composer.lock
  commitados). Sem wrapper Laravel — `ProposalPdfRenderer` é a única
  classe que toca a API do dompdf diretamente.
* Mudança de infraestrutura local: `gd` (com JPEG/WebP/FreeType) agora
  faz parte da imagem Docker do `api` — necessária para qualquer PDF com
  logo funcionar neste ambiente; documentada aqui explicitamente porque
  não estava no escopo textual do gate, mas era bloqueador técnico real
  (confirmado por reprodução: dompdf lança `PHP GD extension is
  required` ao tentar embutir qualquer imagem sem ela).
* `PROPOSAL-DOC-01B` (frontend, fora deste gate) poderá construir a UI
  de configuração de condições comerciais e os botões de
  preview/download de PDF diretamente sobre os contratos já expostos
  aqui (`BudgetResource`, `PublicProposalResource`,
  `/proposal-preview.pdf`, `/proposals/{token}/pdf`) sem exigir nenhuma
  mudança de contrato adicional.
* Uma v2 de template visual é uma extensão aditiva natural:
  `proposal_template_version` já existe na estrutura de dados, só falta
  um novo `resources/views/proposals/pdf/v2.blade.php` e um novo `case`
  no `match` do renderer — nenhuma proposta já submetida muda de
  aparência retroativamente.
