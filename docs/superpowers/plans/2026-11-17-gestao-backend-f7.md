# Gestão backend — F7: front HTTP

> Detalha a F7 de `2026-11-17-gestao-backend.md`. Spec: `specs/2026-11-17-gestao-backend-design.md`.
> Escrito inline: os skills `superpowers:*` não existem nesta sessão (mesmo caso da F4). TDD onde há regra (contrato dos repositories); telas conferidas por `pnpm typecheck` e pelo roteiro de QA.

**Goal:** o `/gestao` fala com o backend real quando `NUXT_PUBLIC_GESTAO_BACKEND=http`, sem mudar o que a Olmi validou em `mock` (padrão).

## Contratos consumidos (reais, lidos dos endpoints)

| Área | Rotas |
|---|---|
| Acesso | `POST auth/login` → `{accessToken, refreshToken, expiresAt, codigo}`; `POST auth/codigo {codigo}` → sessão; `POST auth/reenviar`; `GET auth/convite/:token`; `POST auth/aceitar {token,nome,senha}`; `GET sessao` → `{membro, sessao, matriz}` |
| Vendas | `GET vendas[?arquivados=1]` (array de `{versao, processo}`); `POST vendas`; `GET vendas/:id`; `POST vendas/:id/acoes {acao,dados}` |
| Locação | `GET locacoes[?arquivadas=1]` → `{locacoes}`; `POST locacoes`; `POST locacoes/:id/acoes {acao,dados,versao}` |
| Documentos | `GET documentos?alvo=venda:ID`; `POST documentos/upload` → `{documentoId,uploadUrl,token,versao}`; `POST documentos/:id/confirmar`; `GET documentos/:id/download`; `POST …/conferir|apagar|restaurar`; `GET documentos/lixeira` |
| Imóveis | `GET/POST imoveis`, `PUT/DELETE imoveis/:id`, `POST imoveis/:id/status|destaque|fotos`, `POST …/fotos/:f/capa|mover`, `DELETE …/fotos/:f` |
| Outros | `matriz`, `configuracoes`, `membros`, `consultas` |

## Arquitetura

```
services/clienteGestao.ts        $fetch + Bearer + erros normalizados (401/409/422/429); recebe $fetch e o provedor de token por parâmetro
services/GestaoRepository.ts     interface (vendas, locações, documentos, matriz, config, consulta)
services/MockGestaoRepository.ts o que o store fazia: domínio puro sobre um armazém (localStorage)
services/HttpGestaoRepository.ts rotas acima; guarda `versao` por agregado
services/HttpImoveisRepository.ts ImoveisRepository sobre /api/gestao/imoveis
composables/useGestaoStore.ts    escolhe o repository por runtimeConfig.public.gestaoBackend e delega
composables/useGestaoAuth.ts     mock = domínio/localStorage (igual); http = rotas auth/*, tokens em memória
```

## Tarefas

- [x] T0 (servidor) `carregarAlvoVisivel` respeita `arquivado` (+ GET da venda) — commit próprio.
- [x] T1 `clienteGestao` + testes (Bearer, 401 → sessão expirada, 409 → «alterado por outra pessoa», 422 → erro do domínio, 429).
- [x] T2 `GestaoRepository` + `MockGestaoRepository` + `HttpGestaoRepository`; suíte de contrato `describe.each([mock, http])` (http com `$fetch` falso que faz o papel do servidor).
- [x] T3 `HttpImoveisRepository` + contrato com o `MockImoveisRepository`.
- [x] T4 Store delega; telas passam de `store.aplicar(fn)` (síncrono, função pura do domínio) para `store.executar(tipo, id, acao, dados)` (assíncrono, nome da ação).
- [x] T5 `useGestaoAuth`/`useGestaoSessao` em `http`; Supabase client só para refresh, tokens em memória.
- [x] T6 Upload de documento (URL assinada) e foto (rota da F5).
- [x] T7 `test/qa/fluxos.md` em `http`; `pnpm typecheck && pnpm test`; commit/push em `-f7`.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Telas chamam `executar(tipo, id, acao, dados)` por NOME de ação, e o Mock traduz o nome para a função pura | Manter `aplicar(fn)` e, em `http`, adivinhar a ação pela função | A função é uma closure: não há como saber que ação ela é. O nome é o que o servidor despacha |
| Cada ação devolve o agregado novo e o store troca só ele | Recarregar as listas depois de cada ação | 1 requisição em vez de 3 e sem piscar a tela |
| `versao` fica num estado compartilhado (`useState`), não no repository | Campo do repository | O store é recriado por componente; a versão que a aba leu tem de sobreviver |
| Tokens em variável de módulo; Supabase client com `persistSession: false` só para o refresh | `localStorage`/`sessionStorage` | Pedido: nada de token em storage. Preço: recarregar a página pede login + código de novo |
| Corretores vêm de `GET /api/gestao/corretores` (novo, leitura, escopo do tenant) | Continuar com `CORRETORES` do seed | O seed tem ids `c1…`; o servidor exige `brokers.id` do tenant. Sem a lista o Dono não abre contrato em `http` |
| Foto sobe pela rota da F5 (data URL, 4 por requisição); documento pela URL assinada da F3 | URL assinada também para foto | A F5 decidiu assim (corretor não tem policy de storage); o pedido citava as duas, vale o que o servidor tem |
| Documentos carregados por processo, sob demanda, + lixeira | Listagem global | Não existe `GET documentos` sem `alvo`; a página «Documentos» carrega os visíveis (máx. 50, 6 em paralelo) |
| Dashboard/Financeiro/Auditoria seguem calculados no cliente sobre o que o store já carregou | Chamar `/dashboard`, `/financeiro`, `/auditoria` | Mesmas funções de domínio do servidor; trocar a fonte muda a tela e a Olmi não pediu. Ficam para quando a Olmi pedir; os endpoints existem (F6) |
| Página do contrato chama `carregarDetalhe` (GET do agregado) ao abrir, em `http` | Usar só a lista | A lista traz o CPF das partes mascarado; o formulário regravaria o CPF mascarado ao salvar |
| Conflito 409: o store relê o agregado e devolve a falha com a frase do servidor | Só mostrar o erro | Sem reler, a segunda tentativa tomaria 409 de novo |
| Venda manda `versao` mas o servidor ainda não a exige (F2 confere só dentro da requisição) | Mudar a F2 aqui | Fora do escopo da F7; está no relatório como lacuna (locação já exige) |
| `pdf` do contrato inicial vira documento da categoria `venda`; a marca `pdf` do processo não é settável pela API | Criar ação nova no servidor | Fora do escopo; «contratos sem PDF» seguirá acusando até a F2 marcar `pdf` ao confirmar o documento |

## Verificação

`pnpm typecheck && pnpm test` verdes (192 arquivos). Não foi aberto navegador: o dev server precisa do Supabase do tenant, e a regra desta fase proíbe tocar o banco compartilhado. Telas conferidas por typecheck; fluxos em `test/qa/fluxos.md` (seção H) ficam para quem tem um banco de teste com as migrations 0059–0063.
