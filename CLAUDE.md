# ObraFácil

Nome provisório: **ObraFácil**

Posicionamento do produto:

> Calcule. Orce. Controle sua obra.

Objetivo: criar uma aplicação SaaS mobile-first para transformar medidas de uma
obra em quantitativos, custos, orçamentos e, posteriormente, gestão financeira
da obra.

Este arquivo é o contrato principal de implementação para as próximas tarefas.
Veja também [README.md](README.md) (como rodar o projeto) e
[docs/decisions/ADR-001-architecture.md](docs/decisions/ADR-001-architecture.md)
(racional da arquitetura).

---

# Arquitetura definida

Frontend:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

Backend:

```text
Laravel
PHP
REST API
```

Banco e infraestrutura futura/atual:

```text
PostgreSQL
Redis
Docker
```

Arquitetura:

```text
Monorepo

apps/web → frontend
apps/api → backend
```

---

# FASE ATUAL DO PROJETO

```text
FASE ATUAL: FRONTEND PROTOTYPE
```

Durante esta fase:

```text
apps/web
DESENVOLVIMENTO ATIVO

apps/api
CONGELADO
```

O objetivo atual é construir e validar toda a experiência visual do produto
antes de implementar o backend funcional.

---

# Estratégia frontend-first

Durante esta fase devemos construir:

* telas;
* navegação;
* fluxos;
* componentes;
* estados visuais;
* interações;
* dados mockados;
* comportamento simulado;
* responsividade.

É permitido usar:

* arrays mockados;
* objetos mockados;
* funções TypeScript locais;
* estado React;
* persistência temporária no navegador quando realmente útil para prototipação;
* cálculos provisórios no frontend para validar UX.

Esses recursos são temporários. Eles **não representam a arquitetura
definitiva das regras de negócio**.

---

# Backend congelado

Durante a fase `FRONTEND PROTOTYPE`, NÃO implementar:

* autenticação real;
* Laravel Sanctum;
* multi-tenancy funcional;
* Organization;
* Membership;
* migrations de domínio;
* API de clientes;
* API de obras;
* API de materiais;
* API de serviços;
* API de orçamentos;
* Calculation Engine Laravel;
* financeiro backend;
* filas;
* integrações;
* geração de PDF real;
* pagamentos;
* WhatsApp;
* persistência real de dados de produto.

Também não modificar `apps/api` sem uma tarefa explícita autorizando isso.

O backend existente deve continuar compilando e funcionando, mas não deve
evoluir durante esta fase.

---

# Regra arquitetural definitiva

Mesmo que durante o protótipo alguns cálculos ou regras sejam simulados no
frontend, na arquitetura final:

> Laravel será a fonte de verdade das regras de negócio.

Next.js será responsável principalmente por:

* apresentação;
* interação;
* experiência do usuário;
* formulários;
* estados de interface;
* consumo da API.

Laravel será responsável posteriormente por:

* autorização;
* validação definitiva;
* regras de negócio;
* cálculos oficiais;
* persistência;
* auditoria;
* integrações;
* geração de documentos.

Não transportar regras provisórias do frontend para produção
automaticamente. Elas deverão ser reavaliadas quando o backend for
implementado.

---

# Mobile-first

Toda interface nova deve ser pensada primeiro para celular.

Referências mínimas obrigatórias:

```text
375px
390px
430px
```

Depois adaptar para:

```text
tablet
desktop
```

Não desenvolver primeiro desktop para depois tentar encaixar no mobile.

---

# Princípio central de UX

> Uma ação principal por tela sempre que possível.

> Se o usuário precisa pensar demais para descobrir o que fazer, a tela está
> errada.

O público não deve precisar conhecer conceitos técnicos de engenharia, ERP ou
composição de custos para executar tarefas comuns. A complexidade deve ficar
escondida quando possível.

---

# Navegação

A experiência mobile deve priorizar padrões naturais de aplicativo:

* bottom navigation;
* bottom sheets;
* cards grandes;
* botões com área de toque adequada;
* inputs grandes;
* teclado numérico quando apropriado;
* feedback visual;
* estados de loading;
* estados vazios;
* mensagens de erro claras.

No desktop, poderá ser utilizada sidebar. Não assumir que a mesma composição
visual deve ser usada literalmente nos dois formatos.

---

# Design System

Utilizar shadcn/ui como fundação, mas não deixar o projeto visualmente com
aparência padrão de shadcn. Criar identidade própria progressivamente.

Não construir dezenas de componentes antecipadamente. Criar componentes
conforme necessidades reais das telas surgirem. Priorizar reutilização, mas
evitar abstrações prematuras.

---

# Organização do frontend

Favorecer organização por funcionalidades.

Exemplo conceitual:

```text
src/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   └── shared/
├── features/
├── hooks/
├── lib/
├── mocks/
├── schemas/
└── types/
```

Não reorganizar todo o projeto apenas para obedecer esse exemplo caso a
estrutura existente esteja adequada. Toda reorganização relevante deve ter
justificativa.

---

# Dados mockados

Centralizar mocks sempre que fizer sentido. Evitar espalhar grandes objetos
mockados diretamente pelas páginas.

Exemplo:

```text
src/mocks/
├── user.ts
├── budgets.ts
├── projects.ts
├── customers.ts
├── materials.ts
└── dashboard.ts
```

Os mocks devem parecer plausíveis para o contexto brasileiro de construção
civil.

Valores monetários apresentados ao usuário devem usar formato brasileiro
quando aplicável:

```text
R$ 1.250,00
```

Medidas também devem respeitar a interface em português.

---

# Idioma

A interface inicial do produto será em:

```text
Português do Brasil
```

Código pode permanecer em inglês. Preferir nomes técnicos no código em
inglês, por exemplo:

```text
Budget
Project
Customer
Material
Calculation
```

Não misturar português e inglês de maneira arbitrária nos identificadores.

---

# Testes durante o protótipo

Não buscar cobertura alta de testes nesta fase.

Obrigatório manter:

* lint funcionando;
* TypeScript funcionando;
* build funcionando.

Criar testes apenas para comportamentos básicos ou funções realmente críticas
nesta fase. Não criar testes extensivos para componentes puramente visuais.
Não adicionar infraestrutura pesada de testes sem necessidade.

---

# Dependências

Não adicionar biblioteca simplesmente por conveniência.

Antes de instalar dependência:

1. verificar se React, Next.js, Tailwind ou shadcn já resolvem;
2. avaliar o impacto da dependência;
3. adicionar somente se houver benefício claro.

Ao finalizar cada tarefa, informar qualquer nova dependência adicionada e sua
justificativa.

---

# Proibições

Durante a implementação:

* não mudar stack;
* não substituir Next.js;
* não substituir Laravel;
* não introduzir Prisma;
* não introduzir outro ORM frontend;
* não adicionar Supabase/Firebase;
* não criar GraphQL;
* não criar microservices;
* não adicionar Turborepo/Nx sem autorização;
* não criar abstrações para problemas que ainda não existem;
* não duplicar componentes;
* não alterar arquitetura sem autorização explícita;
* não implementar funcionalidades fora do escopo da tarefa;
* não continuar automaticamente para a próxima tarefa.

---

# Forma de trabalho

Cada tarefa enviada terá escopo limitado.

Ao receber uma tarefa:

1. entender o escopo;
2. inspecionar código existente;
3. reutilizar o que já existe;
4. implementar somente o solicitado;
5. validar;
6. parar.

Nunca continuar para o próximo módulo por iniciativa própria.

Se encontrar algo arquiteturalmente questionável que não impeça a tarefa
atual, documentar no relatório em vez de refatorar automaticamente.

---

# Relatório obrigatório ao finalizar tarefas

Ao terminar cada tarefa, informar:

1. arquivos criados;
2. arquivos modificados;
3. componentes adicionados;
4. dependências adicionadas;
5. decisões técnicas tomadas;
6. comandos de validação executados;
7. resultado de lint;
8. resultado do TypeScript;
9. resultado do build;
10. testes executados, se houver;
11. problemas encontrados;
12. desvios da especificação;
13. pontos que precisam de decisão arquitetural.

Não responder apenas "concluído".
