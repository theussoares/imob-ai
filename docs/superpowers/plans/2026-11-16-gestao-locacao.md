# Gestão — Contratos de locação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de Contratos de locação do painel de gestão (lista, nova locação, processo de 8 etapas), em mock local como as vendas.

**Architecture:** Domínio puro novo em `layers/gestao/domain` (tipos, etapas, requisitos, transições), mesmas regras de «final é só leitura», `Resultado` e `Ator` de `acoes.ts`. `Estado` ganha `locacoes`; `Documento` e permissões são reaproveitados. Telas novas em `app/pages/gestao/locacao/**`, espelhando `vendas/**`.

**Tech Stack:** Nuxt 4 layer, Vue 3, Tailwind (utilitários, sem `<style scoped>`), Vitest em Node puro.

**Spec:** `docs/superpowers/specs/2026-11-16-gestao-locacao-design.md` (e `2026-11-15-painel-gestao-design.md` para o padrão).

## Global Constraints

- Comentários, commits e specs em português; identificadores no padrão do arquivo (domínio em português, como `Processo`, `acoes-ciclo.ts`).
- Estilo só com utilitários Tailwind; **proibido** a classe `grid` pura, use `[display:grid]` (`test/estilo.test.ts` cai se violar).
- Nome de etapa não abrevia «Documentos» (idem teste).
- Alvos de toque ≥ 44px (`min-h-11`), elementos reais (`button`, `label`+`input`), contraste AA.
- Módulos de domínio importados pelo seed/mock usam `.ts` explícito nos imports (Node puro).
- Transições puras: nunca mutam o estado recebido; devolvem `Resultado`.
- Locação encerrada (`status === 'Encerrada'`) é só leitura.
- Aba/área de valores (etapa 7 e cobranças) só com `caps.valores`; sem isso nem aparece.
- Não mexer em Imóveis, Financeiro, Dashboard (ficam para depois).
- Validação: `pnpm typecheck && pnpm test` verdes antes de cada commit.

## Review Focus

- Corretor com `verTodos = proprio` abrindo `/gestao/locacao/<id>` de outro corretor: «não encontrada», sem revelar existência.
- `fim` do contrato antes de `inicio`, ou `diaVencimento` fora de 1..28: recusa com mensagem.
- Gerar cobrança duas vezes para a mesma competência (`AAAA-MM`): recusa.
- Marcar pagamento sem comprovante; registrar repasse de cobrança ainda não paga: recusa.
- Renovar/encerrar locação já encerrada ou arquivada; arquivar locação ainda ativa: recusa.

---

### Task 1: Tipos, etapas e status da locação

**Files:**
- Modify: `layers/gestao/domain/types.ts` (acrescentar tipos; `Estado` mora em `acoes.ts`, ver Task 4)
- Create: `layers/gestao/domain/locacao-status.ts`
- Test: `layers/gestao/test/domain/locacao-status.test.ts`

**Interfaces:**
- Produces (em `types.ts`):
  - `type StatusLocacao = 'Em abertura' | 'Aguardando documentação' | 'Aguardando garantia' | 'Aguardando vistoria de entrada' | 'Contrato e aluguel' | 'Ativa' | 'Encerrada'`
  - `type TipoGarantia = 'Caução' | 'Seguro-fiança' | 'Fiador' | 'Título de capitalização' | 'Outra'`
  - `interface Vistoria { data: string /*ISO*/; responsavel: string; fotos: string[]; observacao: string }`
  - `interface ContratoLocacao { valor: number; diaVencimento: number; inicio: string; fim: string; reajuste: 'IGP-M' | 'IPCA' | 'Outro'; taxaPct: number }`
  - `interface Repasse { valor: number; feito: boolean; data?: string; comprovante?: string | null }`
  - `interface Cobranca { id: string; competencia: string /*AAAA-MM*/; valor: number; vencimento: string; pago?: { data: string; comprovante: string }; repasse?: Repasse }`
  - `interface Locacao { id: string; tipo: 'locacao'; locador: Pessoa; locatario: Pessoa; imovelId: string; imovel: string; corretorId: string; status: StatusLocacao; updated: string; etapa: number; concluidas: boolean[]; garantia?: { tipo: TipoGarantia; detalhe: string }; vistoriaEntrada?: Vistoria; vistoriaSaida?: Vistoria; contrato?: ContratoLocacao; cobrancas: Cobranca[]; hist: EventoHistorico[]; obs: string; arquivado: boolean }`
- Produces (em `locacao-status.ts`): `STATUS_LOCACAO: StatusLocacao[]`, `TOM_STATUS_LOCACAO: Record<StatusLocacao, TomStatus>`, `ETAPAS_LOCACAO` (const tuple: `'Abertura'`, `'Documentos do locatário'`, `'Documentos do locador'`, `'Documentos do imóvel'`, `'Garantia'`, `'Vistoria'`, `'Contrato e financeiro'`, `'Acompanhamento'`), `TOTAL_ETAPAS_LOCACAO = 8`, `locacaoFinal(s: StatusLocacao): boolean`, `statusPorEtapa(etapa: number, concluidas: boolean[]): StatusLocacao`.

- [ ] **Step 1: Write the failing test** — `locacao-status.test.ts`: `ETAPAS_LOCACAO` tem 8 itens e nenhum casa `/\bDocs?\b/`; `statusPorEtapa(1, feitas(0))` = `'Em abertura'`; etapa 2/3/4 = `'Aguardando documentação'`; 5 = `'Aguardando garantia'`; 6 = `'Aguardando vistoria de entrada'`; 7 = `'Contrato e aluguel'`; 8 com 7 concluídas = `'Ativa'`; `locacaoFinal('Encerrada')` true e `locacaoFinal('Ativa')` false.
- [ ] **Step 2: Run** `pnpm vitest run layers/gestao/test/domain/locacao-status.test.ts` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** os tipos e `locacao-status.ts` com as assinaturas acima. `TOM_STATUS_LOCACAO`: Em abertura neutral, Aguardando documentação/garantia/vistoria amber, Contrato e aluguel purple, Ativa green, Encerrada neutral.
- [ ] **Step 4: Run** o teste — Expected: PASS.
- [ ] **Step 5: Commit** `feat(gestao): tipos e etapas da locação`

---

### Task 2: Requisitos e pendências por etapa

**Files:**
- Modify: `layers/gestao/domain/requisitos.ts` (acrescentar itens ao `CATALOGO`; não alterar o comportamento da venda)
- Create: `layers/gestao/domain/locacao-requisitos.ts`
- Test: `layers/gestao/test/domain/locacao-requisitos.test.ts`

**Interfaces:**
- Consumes: `Requisito`, `estadoRequisito`, `requisitoPorChave` de `requisitos.ts`; `Locacao`, `Documento`.
- Produces: `requisitosDaEtapaLocacao(etapa: number): Requisito[]` e `pendenciasEtapaLocacao(l: Locacao, docs: Documento[], etapa: number): string[]`.
- Catálogo novo (chave → nome → categoria): `locatario:rg-cnh` «RG ou CNH» `pessoas`; `locatario:renda` «Comprovante de renda» `pessoas`; `locatario:residencia` «Comprovante de residência» `pessoas`; `locador:rg-cnh`, `locador:certidao` «Certidão de nascimento ou de casamento», `locador:residencia` `pessoas`; `locimovel:matricula` «Matrícula atualizada», `locimovel:iptu` «IPTU», `locimovel:agua-luz` «Comprovante de água e luz» `imoveis`; `locacao:garantia` «Comprovante da garantia» `locacao`.

- [ ] **Step 1: Write the failing test** — etapa 2 exige 3 itens do locatário, 3 do locador na 3, 3 do imóvel na 4, só `locacao:garantia` na 5, vazio nas demais. `pendenciasEtapaLocacao`: etapa 1 com `locador.nome` vazio → contém `'Informe o locador.'` (idem `'Informe o locatário.'`, `'Informe o imóvel.'`); etapas 2 e 3 sem CPF/telefone/e-mail da pessoa → uma frase por campo ausente, no estilo da venda; faltando arquivos → `'Faltam N documentos: ...'` (singular `'Falta enviar 1 documento: ...'`); etapa 5 sem `garantia` → `'Escolha o tipo de garantia e salve.'` mais o arquivo pendente; etapa 6 sem `vistoriaEntrada` → `'Registre a vistoria de entrada.'`; vistoria sem fotos → `'Anexe ao menos uma foto da vistoria.'`; etapa 7 sem `contrato` → `'Salve os dados do contrato.'`.
- [ ] **Step 2: Run** `pnpm vitest run layers/gestao/test/domain/locacao-requisitos.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** reutilizando `estadoRequisito` (estado derivado do arquivo, nunca checkbox) e as mesmas frases/plural da venda.
- [ ] **Step 4: Run** o teste e `pnpm vitest run layers/gestao/test/domain/requisitos.test.ts` (venda intacta) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(gestao): requisitos e pendências da locação`

---

### Task 3: Transições da locação (`acoes-locacao.ts`)

**Files:**
- Create: `layers/gestao/domain/acoes-locacao.ts`, `layers/gestao/domain/filtro-locacao.ts`
- Test: `layers/gestao/test/domain/acoes-locacao.test.ts`, `layers/gestao/test/domain/filtro-locacao.test.ts`

**Interfaces:**
- Consumes: `Estado` (já com `locacoes`, Task 4 — implementar Task 4 Step 3 primeiro ou em conjunto), `Ator`, `Resultado`, `agora` de `acoes.ts`; `pendenciasEtapaLocacao`; `statusPorEtapa`, `locacaoFinal`.
- Produces (todas `(estado, ..., ator: Ator, quando = agora()) => Resultado`, seguindo `alterar` de `acoes-processo.ts` mas sobre `estado.locacoes`; helper interno `alterarLocacao` recusa final com `'Esta locação está encerrada e só aceita consulta.'`, registra histórico e recalcula `status` com `statusPorEtapa`):
  - `proximoIdLocacao(locacoes: Locacao[], ano?: number): string` → `L-AAAA-NNNN`
  - `abrirLocacao(e, d: { locador: string; locatario: string; imovelId: string; imovel: string; corretorId: string }, a, q?)`
  - `salvarAberturaLocacao(e, id, d: { locador: Pessoa; locatario: Pessoa; imovelId: string; imovel: string; corretorId: string }, a, q?)` (CPF/CNPJ 11 ou 14 dígitos quando preenchido)
  - `salvarGarantia(e, id, d: { tipo: TipoGarantia; detalhe: string }, a, q?)`
  - `salvarVistoria(e, id, quando: 'entrada' | 'saida', d: Vistoria, a, q?)` (saída só depois da etapa 7 concluída)
  - `salvarContrato(e, id, d: ContratoLocacao, a, q?)` — recusa `diaVencimento` fora de 1..28, `fim <= inicio`, `valor <= 0`, `taxaPct` fora de 0..100
  - `gerarCobranca(e, id, competencia: string, a, q?)` — valor = `contrato.valor`, vencimento = `competencia` + `diaVencimento`; recusa competência repetida ou sem contrato
  - `registrarPagamento(e, id, cobrancaId, d: { data: string; comprovante: string }, a, q?)` — recusa comprovante vazio; cria `repasse` pendente com `valor = valor − valor×taxaPct/100` (2 casas)
  - `registrarRepasse(e, id, cobrancaId, d: { data: string; comprovante: string }, a, q?)` — recusa cobrança não paga ou repasse já feito
  - `concluirEtapaLocacao(e, id, etapa: number, d: { responsavel?: string }, a, q?)` — recusa se `pendenciasEtapaLocacao(...)` não vazio (documentos: `estado.documentos`); só avança em ordem; ao concluir a 7 vai para etapa 8
  - `renovarLocacao(e, id, a, q?)` — `fim` +12 meses; só com status `Ativa`
  - `encerrarLocacao(e, id, a, q?)` — exige `vistoriaSaida` e nenhum repasse pendente; status `Encerrada`
  - `arquivarLocacao` / `restaurarLocacao(e, id, a, q?)` — arquivar só `Encerrada`, como `acoes-ciclo.ts`
  - `filtrarLocacoes(locacoes, { q: string; status: StatusLocacao | '' }, corretores): Locacao[]` — mesma normalização de `filtro.ts` (reusar `normalizar`), busca em id, locador, locatário, imóvel, corretor, status.

- [ ] **Step 1: Write the failing tests** — um `it` por regra listada em Review Focus e por recusa acima, mais: abrir cria `L-AAAA-0001` com `etapa 1`, `concluidas` de 8 `false`, `status 'Em abertura'`; concluir etapa 2 sem docs falha com a frase de pendência; com docs enviados avança e status vira `'Aguardando documentação'`→`'Aguardando documentação'` (etapa 3); pagamento gera repasse com valor `valor*(1-taxa/100)`; renovar `fim '2027-01-10'` → `'2028-01-10'`; estado original nunca é mutado (comparar com cópia profunda).
- [ ] **Step 2: Run** `pnpm vitest run layers/gestao/test/domain/acoes-locacao.test.ts layers/gestao/test/domain/filtro-locacao.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** os módulos conforme as assinaturas.
- [ ] **Step 4: Run** os testes — Expected: PASS.
- [ ] **Step 5: Commit** `feat(gestao): transições da locação`

---

### Task 4: Integração no estado, seed, mock, permissões e menu

**Files:**
- Modify: `layers/gestao/domain/acoes.ts` (`Estado` ganha `locacoes: Locacao[]`), `domain/seed.ts`, `domain/permissions.ts`, `app/composables/useGestaoStore.ts`, `mocks/gestao.mock.ts`
- Test: `layers/gestao/test/domain/permissions.test.ts` (acrescentar), `layers/gestao/test/domain/locacao-seed.test.ts`

**Interfaces:**
- Produces: `locacoesSeed(): Locacao[]` e `IMOVEIS_EXEMPLO: { id: string; rotulo: string }[]` (5 imóveis de exemplo) em `seed.ts`; `locacoesVisiveis(matriz, sessao, locacoes): Locacao[]` em `permissions.ts` (mesma regra de `processosVisiveis`: sem arquivadas, corretor só as suas); `useGestaoStore()` expõe `locacoes` e `locacoesVisiveis`; mock `GET /api/gestao/locacoes` → `{ data: Locacao[] }`; `MENU` item `locacao` com `pronto: true`.
- Seed: 4 locações — uma por situação: `Em abertura` (c1), `Aguardando garantia` (c2), `Ativa` com contrato e 2 cobranças (uma paga com repasse pendente, uma em aberto) (c1), `Encerrada` arquivável (c3). Documentos do seed (`documentosSeedCompleto`) incluem os arquivos das etapas já concluídas, ligados por `requisito`.

- [ ] **Step 1: Write the failing tests** — `locacoesVisiveis`: corretor c1 vê só as suas, recepção vê todas, arquivada some; `locacoesSeed()` cobre os 4 status e cada locação concluída tem `pendenciasEtapaLocacao` vazio nas etapas marcadas como concluídas.
- [ ] **Step 2: Run** `pnpm vitest run layers/gestao/test/domain/permissions.test.ts layers/gestao/test/domain/locacao-seed.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Ajustar todos os lugares que constroem `Estado` (`useGestaoStore`, testes existentes) para incluir `locacoes`. No store: `CHAVE` passa a `'gestao-demo-v3'` (comentário: v3 trouxe `locacoes`; o v2 guardado deixaria a lista vazia); guardado sem array `locacoes` cai no seed.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test` — Expected: tudo verde (venda intacta).
- [ ] **Step 5: Commit** `feat(gestao): estado, seed e permissões da locação`

---

### Task 5: Lista e «Nova locação»

**Files:**
- Create: `app/pages/gestao/locacao/index.vue`, `app/components/GestaoCardLocacao.vue`, `app/components/GestaoNovaLocacaoModal.vue`, `app/components/GestaoStatusChipLocacao.vue`
- Modify: nada na venda; a rota `/gestao/locacao` ganha arquivo próprio e vence `[secao].vue`.

**Interfaces:**
- Consumes: `useGestaoStore()` (`locacoesVisiveis`, `aplicar`, `caps`, `acoes` + `abrirLocacao` importada), `filtrarLocacoes`, `STATUS_LOCACAO`, `IMOVEIS_EXEMPLO`, `CORRETORES`.
- Produces: rota `/gestao/locacao` (cards, busca `data-testid="busca"`, filtro `data-testid="filtro-status"`, botão `data-testid="nova-locacao"` só com `caps().criar`); modal com locador, locatário, imóvel (`<select>` de `IMOVEIS_EXEMPLO`) e corretor (corretor logado fixo no perfil corretor); ao criar, navega para `/gestao/locacao/<id>`.

- [ ] **Step 1: Implement** copiando a estrutura de `vendas/index.vue` e `GestaoCardProcesso.vue` (carregando, falha, vazio, contagem). Card mostra id, locador → locatário, imóvel, status, progresso `n de 8 etapas`, corretor.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm vitest run layers/gestao/test/estilo.test.ts` — Expected: PASS.
- [ ] **Step 3: Verify no navegador** (`pnpm dev:gestao`, perfil Corretor): vê só as suas; criar nova abre a tela do processo.
- [ ] **Step 4: Commit** `feat(gestao): lista e nova locação`

---

### Task 6: Tela da locação (8 etapas)

**Files:**
- Create: `app/pages/gestao/locacao/[id].vue`, `app/components/GestaoEtapaLocacao.vue` (painel por etapa; se passar de 80 linhas de template, um componente por bloco: `GestaoGarantia.vue`, `GestaoVistoria.vue`, `GestaoContratoLocacao.vue`, `GestaoCobrancas.vue`)
- Reuso sem alterar: `GestaoStepper` (aceita 8 etapas), `GestaoRequisitos` (documentos por etapa), `GestaoEnviarDocumentoModal`.

**Interfaces:**
- Consumes: ações da Task 3, `pendenciasEtapaLocacao`, `requisitosDaEtapaLocacao`, `store.locacoesVisiveis`, `store.caps()`.
- Regras de tela: locação fora de `locacoesVisiveis` → 404 «Locação não encontrada»; etapas 1–4 editam com `caps.editar`; etapa 5 e 6 com `caps.editar`; etapa 7 (contrato, cobranças, pagamentos, repasses) **só aparece com `caps.valores`** e é editada por quem o tiver; sem `valores` a etapa 7 mostra apenas «Etapa concluída/pendente» sem números; etapa 8: botões «Renovar por 12 meses», «Encerrar» (precisa vistoria de saída, formulário reutiliza `GestaoVistoria` com `quando='saida'`), «Arquivar» (`caps.arquivar`, só `Encerrada`); botão «Concluir etapa» desabilitado enquanto `pendenciasEtapaLocacao` não for vazio, listando as frases; locação `Encerrada` só leitura; histórico visível no rodapé.

- [ ] **Step 1: Implement** espelhando `vendas/[id].vue` (`executar`, toasts, `etapaVista` local). Página só compõe; regra fica no domínio.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm test` — Expected: PASS.
- [ ] **Step 3: Verify no navegador** como Corretor, Recepção, Jurídico e Dono: percorrer abertura → documentos → garantia → vistoria → contrato → gerar cobrança → pagar com comprovante → repassar → renovar → vistoria de saída → encerrar → arquivar; confirmar que corretor/recepção não veem valores e que não se conclui etapa com pendência.
- [ ] **Step 4: Commit** `feat(gestao): tela da locação com 8 etapas`

---

### Task 7: Arquivados, QA e documentação

**Files:**
- Modify: `app/pages/gestao/arquivados.vue` (listar também locações arquivadas, com «Restaurar»), `layers/gestao/test/qa/fluxos.md` (roteiro de locação), `docs/superpowers/specs/2026-11-15-painel-gestao-design.md` (linha «Locação» sai de «Fora do escopo»)
- Test: `layers/gestao/test/domain/acoes-locacao.test.ts` (caso arquivar/restaurar já coberto na Task 3)

- [ ] **Step 1: Implement** a lista de arquivados mista (venda + locação) sem mudar o comportamento atual da venda.
- [ ] **Step 2: Write** o roteiro de QA no formato dos fluxos existentes (um fluxo por perfil).
- [ ] **Step 3: Run** `pnpm typecheck && pnpm test` — Expected: verde.
- [ ] **Step 4: Commit** `docs(gestao): roteiro de QA e arquivados da locação`
