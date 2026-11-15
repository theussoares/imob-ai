# Painel de gestão de contratos (layer `gestao`) — MVP de demonstração

Protótipo: artifact "OLMI Imóveis — Sistema de gestão" (claude.ai/artifact/Em4j4Ck4u1NA32HJGfwQPx).
Backlog: ClickUp, lista "Desenvolvimento (épicos e tarefas)" (52 itens).

## Motivo

A Olmi (tenant do Moradi) apresenta o sistema numa reunião em 16/11/2026. O
`/admin` atual é CRM de leads e catálogo; o fluxo de **contrato de venda em 8
etapas, com 4 perfis de permissão** não existe nele. O prazo é um dia, então o
entregável é a estrutura definitiva (layer, domínio, permissões) com telas
funcionando sobre dados de exemplo — não um backend.

## Escopo (fatia de hoje)

1. Login por seletor de perfil (Corretor, Recepção, Jurídico e financeiro, Dono).
2. Layout: topo + menu lateral (mobile: menu horizontal), itens visíveis por permissão.
3. Lista de contratos de venda: cards, busca, filtro dos 13 status, "Novo processo".
4. Processo de venda: stepper de 8 etapas, mudança de status, aba de comissão
   (só jurídico/dono, regra 5% = 40/10/50 + adiantamentos).
5. Documentos: lista, envio, substituição, lixeira com restauração.
6. Dashboard, Imóveis, Locação, Financeiro, Consulta, Auditoria, Usuários,
   Configurações: item de menu presente, tela «em breve».

## Fora do escopo por decisão

- Persistência real (Supabase), RLS, Storage, e-mail/WhatsApp, SPC/Serasa.
- Locação (8 etapas próprias) e alertas 30/60/90.
- Integração do login com `tenant_members`: o perfil do demo é escolhido na tela.
- Flag por tenant em `tenant_features` (exige migration): hoje o gate é
  `runtimeConfig.public.gestaoEnabled` (env `NUXT_PUBLIC_GESTAO_ENABLED`).
  Ligar à `tenant_features` é o primeiro item pós-demo.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Nuxt layer em `layers/gestao`, rotas `/gestao/**` | Páginas dentro de `app/pages/admin` | Isola do CRM atual; o painel pode virar produto/pacote separado sem mover código |
| Regra de negócio em módulos puros (`layers/gestao/domain`) | Lógica dentro dos componentes | Testável em Node puro (vitest do repo), e é o que migra para o servidor depois |
| `mocker-nuxt` serve os GETs de seed em `/api/gestao/*` | Fixtures importadas direto no client | A tela já chama `$fetch` de verdade; trocar o mock pela API real não muda componente |
| Mutações em store no cliente (`useGestaoStore`, persistido em localStorage) | Mocks de POST/PATCH | `mocker-nuxt` 1.0.6 não tem mock com estado (README: "sem mocks CRUD stateful") |
| `basePath: '/api/gestao'` no mocker | `/api` inteiro | Com `/api` o gateway interceptaria `/api/admin`, `/api/leads` etc. do app real |
| Estilo só com utilitários Tailwind (sem `<style scoped>`), tokens do app via `var(--brand)` etc. | CSS escopado por componente | Pedido do time; é o padrão do app. `@source` em `main.css` faz o Tailwind varrer `layers/` |
| Gate por env no MVP | `tenant_features` | Sem migration hoje; develop e produção dividem o banco |
| QA no navegador: fluxos escritos por Sonnet, executados por Haiku | Playwright | Playwright do repo cria tenant `e2e-*` no banco de produção; aqui só há mock |

## Regras de domínio copiadas do protótipo

- 13 status de venda; `Venda concluída`/`Venda cancelada` são finais (só leitura).
- Permissões: `sim | proprio | nao` por perfil e por chave (matriz em `permissions.ts`).
- Corretor só vê processos em que é o corretor (`verTodos = proprio`).
- Comissão: percentual sobre o valor, dividida vendedor 40 / captador 10 / imobiliária 50;
  adiantamento não pode passar do restante da parte.
- Documento apagado vai para a lixeira (quem e quando) e pode ser restaurado.

## Estrutura

```
layers/gestao/
  nuxt.config.ts        módulo mocker-nuxt, runtimeConfig
  domain/               tipos, permissões, status, etapas, comissão, seed (puro, testado)
  mocks/                *.mock.ts do mocker-nuxt (GET /api/gestao/*)
  app/
    layouts/gestao.vue
    middleware/gestao.ts   gate de flag + sessão + permissão de rota
    composables/           useGestaoSessao, useGestaoStore
    components/Gestao*.vue
    pages/gestao/**
  test/                 vitest (unidade) + qa/ (fluxos de QA no navegador)
```
