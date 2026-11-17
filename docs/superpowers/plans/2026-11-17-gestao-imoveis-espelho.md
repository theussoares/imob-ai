# Gestão — Imóveis como espelho do catálogo: plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro completo de imóveis no `/gestao` (criar, editar, status, destaque, excluir, fotos) com o modelo do catálogo, em mock, atrás de uma interface que o backend troca por `/api/admin/properties`.

**Architecture:** Regra em módulos puros (`layers/gestao/domain/imoveis*.ts`, testados em Node). `ImoveisRepository` (interface) + `MockImoveisRepository` (guarda via um «armazém» injetado). O `useGestaoStore` checa permissão no domínio e chama o repositório. Telas: lista, novo, editar.

**Tech Stack:** Nuxt 4 layer `layers/gestao`, Vitest (Node puro), Tailwind (sem `<style scoped>`, nunca a classe `grid` pura: use `[display:grid]`).

**Spec:** `docs/superpowers/specs/2026-11-17-gestao-imoveis-espelho-design.md`

## Global Constraints

- Tipo, finalidade e status vêm de `shared/models` (`PROPERTY_TYPES`, `PropertyPurpose`, `PropertyStatus`, `temQuartos`); tipos do imóvel derivam de `Property` (`Pick`), não se reescrevem.
- Finalidade única: `venda` | `aluguel`. «Venda e locação» do seed (`im-101`, `im-105`) vira `aluguel`.
- **Sem captador** (sem campo, sem padrão). Quem cadastra vira corretor vendedor (`brokerId`); no site aparece só se o corretor tiver `publicVisible`, sem telefone.
- Contato público = número da imobiliária (`config.imobiliaria.telefone`); o formulário não tem telefone de corretor publicável; `ownerPhone` é interno.
- Corretor vê e altera só os imóveis dele (`verTodos`); dono, jurídico e recepção veem todos e podem trocar o corretor. Excluir: dono, ou o corretor vendedor no imóvel dele; bloqueado com locação em andamento.
- Fotos: no máximo 6 por imóvel, com a mesma redução do `/admin` (`resizeForUpload`: 1600 px + `urlSm` 640 px, WebP com fallback JPEG); SVG/HEIC recusados.
- Chave do localStorage sobe para `gestao-demo-v5`. Ids `im-101…` preservados (locações apontam para eles); o texto do contrato (`Locacao.imovel`) é um retrato e **não** muda quando o imóvel é editado.
- Domain importa com `.ts` explícito e caminho relativo (o mock carrega em Node puro). Mensagens de erro são frases prontas para a tela, em pt-BR.
- Testes novos ficam em `layers/gestao/test/`. Validação final: `pnpm typecheck && pnpm test`.

## Review Focus

1. Corretor abre `/gestao/imoveis/im-101` (de outro corretor) pela URL: sem acesso, volta à lista.
2. Excluir imóvel com locação em andamento: recusado com frase clara; o imóvel segue na lista.
3. Foto: 7ª foto, arquivo que não é imagem, e localStorage cheio (`QuotaExceededError`): erro claro, estado anterior intacto, nada some no recarregar.
4. Números e CEP: preço ≤ 0, área vazia, quartos negativos ou decimais, suítes > quartos, CEP com 7 dígitos, UF inválida.
5. Editar o título para o de outro imóvel (duplicado) recusa; salvar sem mudar o título não acusa duplicado consigo mesmo.

---

### Task 1: Modelo, seed e filtros

**Files:**
- Modify: `layers/gestao/domain/imoveis.ts`
- Modify: `layers/gestao/app/components/GestaoNovaLocacaoModal.vue:11`, `layers/gestao/app/components/GestaoLocacaoAbertura.vue:12` (filtro por `purpose`)
- Test: `layers/gestao/test/domain/imoveis.test.ts`

**Interfaces:**
- Produces: `ImovelGestao`, `FotoImovel`, `NovoImovel`, `FiltroImoveis`, `FILTRO_IMOVEIS_VAZIO`, `STATUS_IMOVEL`/`ROTULO_STATUS_IMOVEL`, `ROTULO_FINALIDADE`, `rotuloImovel(i): string`, `imoveisSeed(): ImovelGestao[]`, `situacaoImovel(id, locacoes)`, `filtrarImoveis(imoveis, locacoes, filtro)`.
  - `FotoImovel = Pick<PropertyImage,'id'|'url'|'alt'|'position'|'isCover'>`.
  - `ImovelGestao = Pick<Property,'title'|'type'|'purpose'|'price'|'neighborhood'|'city'|'state'|'addressZip'|'addressStreet'|'addressNumber'|'location'|'bedrooms'|'suites'|'bathrooms'|'parking'|'area'|'highStandard'|'description'|'features'|'status'|'featured'|'createdAt'|'updatedAt'> & { id: string; brokerId: string; ownerName: string; ownerPhone: string | null; images: FotoImovel[] }`.
  - `NovoImovel` = campos editáveis de `ImovelGestao` (sem `id`, `images`, `createdAt`, `updatedAt`), com `type: PropertyType | ''` e `purpose: PropertyPurpose | ''`, números como `number | null`.
  - `FiltroImoveis = { busca: string; situacao: SituacaoImovel | ''; purpose: PropertyPurpose | ''; status: PropertyStatus | '' }`.

- [ ] **Step 1: Atualizar os testes de `imoveis.test.ts`** para o modelo novo, mantendo os existentes que ainda valem:
  - `imoveisSeed` mantém ids e `rotuloImovel` iguais a `IMOVEIS_EXEMPLO` (`rotuloImovel = location ? \`${title} · ${location}\` : title`).
  - `imoveisSeed()` traz `purpose` em `{venda, aluguel}` e `brokerId` em `c1|c2|c3`; `im-101` e `im-105` são `aluguel`; todo imóvel tem `price > 0`, `city === 'Três Lagoas'`, `state === 'MS'`, `status === 'active'`, `images === []`.
  - `filtrarImoveis`: busca sem acento/caixa por título, `location`, `ownerName` e id (`'BARRACAO'` → `['im-105']`, `'otavio'` → `['im-102']`); filtra por `purpose`, `status` e `situacao`.
- [ ] **Step 2: Rodar** `pnpm vitest run layers/gestao/test/domain/imoveis.test.ts` → FAIL (campos novos).
- [ ] **Step 3: Reescrever `domain/imoveis.ts`** com os tipos acima, o seed (cada imóvel de `IMOVEIS_EXEMPLO` + complemento: tipo do registro, `purpose`, preço/área/quartos plausíveis, bairro, `ownerName`, `brokerId`, datas fixas `2026-11-01T12:00:00.000Z`), `situacaoImovel` (inalterada) e `filtrarImoveis`. Remover `cadastrarImovel`/`proximoIdImovel` antigos daqui (vão para a Task 2). `TIPOS_IMOVEL`/`FINALIDADES_IMOVEL` saem; usar `PROPERTY_TYPES` e `PROPERTY_TYPE_LABELS` de `../../../shared/models/property-type.ts`.
- [ ] **Step 4: Trocar o filtro das duas telas de locação** de `finalidade !== 'Venda'` para `purpose === 'aluguel'` (a Abertura mantém `|| i.id === props.locacao.imovelId`); ajustar `rotuloImovel(i)` onde usado.
- [ ] **Step 5: Rodar** o teste da Step 2 → PASS.
- [ ] **Step 6: Commit** `feat(gestao): imóvel do gestão com o modelo do catálogo`.

### Task 2: Ações e permissões do imóvel

**Files:**
- Create: `layers/gestao/domain/imoveis-acoes.ts`
- Test: `layers/gestao/test/domain/imoveis-acoes.test.ts`

**Interfaces:**
- Consumes: Task 1; `Sessao`, `MatrizPermissoes`, `Locacao` de `./types`; `situacaoImovel`.
- Produces:
  - `type ResultadoImovel = { ok: true; imovel: ImovelGestao } | { ok: false; erro: string }`.
  - `validarImovel(dados: NovoImovel): { ok: true; dados: ImovelCampos } | { ok: false; erro: string }` (`ImovelCampos` = campos já normalizados: textos aparados, números definidos, quartos/suítes/banheiros/vagas zerados quando `!temQuartos(type)`).
  - `criarImovel(imoveis, dados, agora: string): ResultadoImovel` (id novo `im-<maior+1>`, `status` vem de `dados.status`, padrão `active`; `createdAt = updatedAt = agora`).
  - `atualizarImovel(imoveis, id, dados, agora): ResultadoImovel` (duplicado ignora o próprio id).
  - `mudarStatusImovel(imoveis, id, status: PropertyStatus, agora): ResultadoImovel`; `definirDestaque(imoveis, id, featured: boolean, agora): ResultadoImovel`.
  - `excluirImovel(imoveis, id): { ok: true; imoveis: ImovelGestao[] } | { ok: false; erro: string }`.
  - `permissoesImovel(matriz, sessao, imovel: ImovelGestao | null): { ver; criar; editar; excluir; trocarCorretor }` (todas `boolean`).
  - `podeExcluirImovel(imovel, sessao, matriz, locacoes): { ok: true } | { ok: false; erro: string }`.
  - `imoveisVisiveis(matriz, sessao, imoveis): ImovelGestao[]`.

- [ ] **Step 1: Escrever os testes**, com as mensagens exatas:
  - `it.each` de recusas de `validarImovel`: título vazio → `'Informe o título do imóvel.'`; tipo `''` → `'Escolha o tipo do imóvel.'`; finalidade `''` → `'Escolha a finalidade (venda ou aluguel).'`; preço `0`/`null`/negativo → `'Informe um preço maior que zero.'`; bairro vazio → `'Informe o bairro.'`; cidade vazia → `'Informe a cidade.'`; UF `'M'` → `'Informe a UF com 2 letras.'`; CEP `'7960000'` → `'O CEP precisa de 8 dígitos.'`; área `null` ou `0` → `'Informe a área em m².'`; quartos `-1` ou `2.5` → `'Quartos precisa ser um número inteiro, de 0 a 50.'`; suítes 3 com quartos 2 → `'As suítes não podem passar do número de quartos.'`; proprietário vazio → `'Informe o proprietário.'`; telefone do proprietário com 9 dígitos → `'O telefone do proprietário precisa de DDD e 8 ou 9 dígitos.'`; `brokerId` vazio → `'Escolha o corretor vendedor.'`.
  - `validarImovel` aceita CEP vazio e telefone vazio; para `type: 'terreno'` devolve quartos/suítes/banheiros/vagas `0` mesmo se enviados.
  - `criarImovel`: id `im-106` sobre o seed; `status` padrão `active`; duplicado (mesmo título + `location`, sem acento/caixa) → `'Já existe um imóvel com este título e endereço.'`.
  - `atualizarImovel`: manter o título do próprio imóvel passa; usar o título de outro recusa; `id` inexistente → `'Imóvel não encontrado.'`; `updatedAt` muda, `createdAt` não; `images` preservadas.
  - `mudarStatusImovel('im-102','sold')` muda só o status; `definirDestaque` idem.
  - `permissoesImovel` com `matrizPadrao()`: corretor `c1` vê/edita `im-101` (dele) e não `im-102`; corretor `excluir` só nos dele; recepção/jurídico `editar` e `trocarCorretor` em todos, `excluir` falso; dono tudo; `trocarCorretor` falso para corretor; `criar` segue `matriz.criar`.
  - `podeExcluirImovel`: imóvel com locação aberta (use `locacoesSeed('2026-11-17')`) → `'Este imóvel tem locação em andamento. Encerre ou arquive a locação antes de excluir.'`; sem permissão → `'Você não pode excluir este imóvel.'`.
  - `imoveisVisiveis` do corretor `c2` = só `brokerId === 'c2'`.
- [ ] **Step 2: Rodar** `pnpm vitest run layers/gestao/test/domain/imoveis-acoes.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `imoveis-acoes.ts`. Duplicado: comparar `rotuloImovel` sem acento/caixa (reuse o helper `sem` de `imoveis.ts`, exportando-o). Validar o primeiro erro e devolver; ordem das regras = ordem da lista acima.
- [ ] **Step 4: Rodar** o teste → PASS; **Step 5: Commit** `feat(gestao): validação, ações e permissões do imóvel`.

### Task 3: Fotos (puro)

**Files:**
- Create: `layers/gestao/domain/imoveis-fotos.ts`
- Test: `layers/gestao/test/domain/imoveis-fotos.test.ts`

**Interfaces:**
- Produces: `FOTOS_IMOVEL_MAX = 6`; `FOTO_TAMANHO_MAX = 400_000` (caracteres do data URL); `FotoNova = { url: string; alt: string | null }`; `adicionarFotos(fotos: FotoImovel[], novas: FotoNova[], novoId: () => string): { ok: true; fotos: FotoImovel[] } | { ok: false; erro: string }`; `definirCapa(fotos, id): FotoImovel[]`; `moverFoto(fotos, id, direcao: 'cima' | 'baixo'): FotoImovel[]`; `removerFoto(fotos, id): FotoImovel[]`.

- [ ] **Step 1: Testes:** primeira foto vira capa (`isCover`), `position` sequencial a partir de 0; 7ª foto → `'Cada imóvel aceita no máximo 6 fotos.'` e lista intacta; `url` que não começa com `data:image/` → `'O arquivo precisa ser uma imagem.'`; `url` acima de `FOTO_TAMANHO_MAX` → `'A foto é grande demais depois de reduzida.'`; `definirCapa` deixa uma só capa; remover a capa promove a primeira restante; `moverFoto` na ponta não muda nada e renumera `position`.
- [ ] **Step 2–4:** rodar (FAIL), implementar, rodar (PASS). **Step 5: Commit** `feat(gestao): fotos do imóvel`.

### Task 4: Repositório e mock

**Files:**
- Create: `layers/gestao/app/services/ImoveisRepository.ts`, `layers/gestao/app/services/MockImoveisRepository.ts`
- Test: `layers/gestao/test/services/mock-imoveis-repository.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `interface ImoveisRepository { listar(): Promise<ImovelGestao[]>; criar(d: NovoImovel): Promise<ResultadoImovel>; atualizar(id: string, d: NovoImovel): Promise<ResultadoImovel>; mudarStatus(id, status): Promise<ResultadoImovel>; definirDestaque(id, featured): Promise<ResultadoImovel>; excluir(id): Promise<{ ok: true } | { ok: false; erro: string }>; adicionarFotos(id, novas: FotoNova[]): Promise<ResultadoImovel>; definirCapa(id, fotoId): Promise<ResultadoImovel>; moverFoto(id, fotoId, direcao): Promise<ResultadoImovel>; removerFoto(id, fotoId): Promise<ResultadoImovel> }` e `interface ArmazemImoveis { ler(): ImovelGestao[]; gravar(lista: ImovelGestao[]): boolean }`; `class MockImoveisRepository implements ImoveisRepository` com `constructor(armazem: ArmazemImoveis, agora: () => string, novoId: () => string)`.
- Autorização **não** mora aqui (o servidor real a repete); o repositório só aplica regra de dados.

- [ ] **Step 1: Testes** com armazém em memória: criar → aparece em `listar()` no topo; `atualizar` preserva `images`; `gravar` devolvendo `false` → resultado `{ ok: false, erro: 'Sem espaço para guardar neste navegador. Remova fotos ou imóveis de exemplo.' }` e `listar()` igual ao de antes (sem mutação parcial); fotos: adicionar 6 ok, 7ª recusada; `excluir('im-999')` → `'Imóvel não encontrado.'`.
- [ ] **Step 2–4:** rodar (FAIL), implementar (cada método: lê, aplica a função pura, grava; se `gravar` falhar devolve o erro acima sem alterar), rodar (PASS). **Step 5: Commit** `feat(gestao): ImoveisRepository com implementação mock`.

### Task 5: Store (v5) ligada ao repositório

**Files:**
- Modify: `layers/gestao/app/composables/useGestaoStore.ts`
- Test: a lógica já está coberta pelas Tasks 2 e 4; o store é verificado por `pnpm typecheck` e pelo roteiro de QA (Task 8).

**Interfaces:**
- Consumes: Tasks 2 e 4.
- Produces (no retorno do store): `imoveis` (todos), `imoveisVisiveis` (computed por sessão), e funções assíncronas `cadastrarImovel(d)`, `atualizarImovel(id, d)`, `mudarStatusImovel(id, s)`, `definirDestaqueImovel(id, f)`, `excluirImovel(id)`, `adicionarFotosImovel(id, novas)`, `definirCapaImovel(id, fotoId)`, `moverFotoImovel(id, fotoId, dir)`, `removerFotoImovel(id, fotoId)`, `permissoesDoImovel(imovel | null)`. Cada uma checa `permissoesImovel`/`podeExcluirImovel` e devolve `{ ok: false, erro: 'Você não pode alterar este imóvel.' }` sem chamar o repositório quando negado.

- [ ] **Step 1:** `CHAVE = 'gestao-demo-v5'` (atualizar o comentário do porquê: imóveis ganharam os campos do catálogo).
- [ ] **Step 2:** `persistir()` passa a devolver `boolean` (`false` no `catch`); o armazém do mock usa isso: grava `imoveis.value = lista`, chama `persistir()` e, se falhar, restaura o valor anterior e devolve `false`.
- [ ] **Step 3:** Instanciar `MockImoveisRepository` no store; trocar `cadastrarImovelNovo` pelas funções acima; manter `imoveis: computed(...)` (as telas de locação usam).
- [ ] **Step 4:** `pnpm typecheck` → sem erros; `pnpm vitest run layers/gestao` → PASS.
- [ ] **Step 5: Commit** `feat(gestao): store de imóveis sobre o repositório`.

### Task 6: Componentes e redução de foto

**Files:**
- Create: `layers/gestao/app/composables/useRedimensionarFoto.ts`, `layers/gestao/app/components/GestaoImovelForm.vue`, `layers/gestao/app/components/GestaoImovelFotos.vue`

**Interfaces:**
- Produces: `useRedimensionarFoto(): { reduzir(arquivo: File): Promise<FotoNova | { erro: string }> }` (reusa `resizeForUpload`, `IMAGE_SIZE_LG/SM` e `isResizableImage` de `app/utils/image.ts`; formato que o canvas não abre → `{ erro: 'Use fotos em JPG, PNG ou WebP.' }`; só aqui mora o `FileReader`). `FotoNova = { url; urlSm: string | null; alt }`, `FotoImovel` ganha `urlSm`.
- `GestaoImovelForm`: props `modelo: NovoImovel`, `corretores: { id; nome }[]`, `podeTrocarCorretor: boolean`, `telefoneSite: string`, `erro: string`, `salvando: boolean`, `rotuloSalvar: string`; emit `salvar` e `update:modelo`. Seções: Anúncio (título, tipo, finalidade, preço, status, destaque, descrição, características), Endereço (CEP, rua, número, bairro, cidade, UF, referência interna = `location`), Medidas (quartos/suítes/banheiros/vagas só se `temQuartos(type)`, área, alto padrão), Interno (proprietário, telefone do proprietário, corretor vendedor — `select` desabilitado se `!podeTrocarCorretor`). Texto fixo: «Contato no site: WhatsApp da imobiliária ({telefoneSite}). O corretor aparece no anúncio só se estiver configurado para aparecer.»
- `GestaoImovelFotos`: props `fotos`, `max`, `erro`, `ocupado`; emits `adicionar(arquivos: File[])`, `capa(id)`, `mover(id, direcao)`, `remover(id)`.
- Todos os `data-testid` no padrão atual: `imovel-*` (`imovel-titulo`, `imovel-tipo`, `imovel-finalidade`, `imovel-preco`, `imovel-salvar`, `imovel-erro`, `imovel-foto-input`, `imovel-foto`, `imovel-foto-capa`, `imovel-foto-remover`).

- [ ] **Step 1:** Criar os três arquivos com Tailwind utilitário, `<label>` + `<input>`, alvo de toque ≥ 44 px (`min-h-11`), sem `<style scoped>` e sem a classe `grid` pura.
- [ ] **Step 2:** `pnpm vitest run layers/gestao/test/estilo.test.ts` → PASS; `pnpm typecheck` → sem erros.
- [ ] **Step 3: Commit** `feat(gestao): formulário e fotos do imóvel`.

### Task 7: Páginas (lista, novo, editar)

**Files:**
- Move: `layers/gestao/app/pages/gestao/imoveis.vue` → `layers/gestao/app/pages/gestao/imoveis/index.vue` (diretório novo ao lado exige que a lista vire `index.vue`)
- Create: `layers/gestao/app/pages/gestao/imoveis/novo.vue`, `layers/gestao/app/pages/gestao/imoveis/[id].vue`
- Check: `layers/gestao/app/middleware/gestao.ts` (a rota `/gestao/imoveis/novo` e `/gestao/imoveis/<id>` herda a guarda de `imoveis`, como `vendas/[id]` já faz).

**Interfaces:**
- Consumes: Tasks 5 e 6.

- [ ] **Step 1: Lista (`index.vue`):** usa `store.imoveisVisiveis`; botão «Cadastrar imóvel» (`data-testid="imovel-novo"`, só se `permissoesDoImovel(null).criar`) leva a `/gestao/imoveis/novo`; filtros busca, situação, finalidade, status do anúncio; card com foto de capa (ou placeholder), título, preço, bairro, selo do status («No site» para `active`, «Rascunho», «Vendido», «Alugado»), selo de situação e corretor vendedor; clique abre `/gestao/imoveis/<id>`.
- [ ] **Step 2: `novo.vue`:** formulário vazio; `brokerId` já escolhido para o corretor logado; ao salvar com sucesso vai para `/gestao/imoveis/<id>` com toast.
- [ ] **Step 3: `[id].vue`:** carrega o imóvel; se não existir ou `!permissoes.ver` → `navigateTo('/gestao/imoveis')`; formulário de edição, bloco de status e destaque (troca imediata), fotos, e «Excluir imóvel» com confirmação (só `permissoes.excluir`; erro do domínio mostrado na tela).
- [ ] **Step 4:** `pnpm typecheck`, `pnpm vitest run layers/gestao` → PASS.
- [ ] **Step 5: Commit** `feat(gestao): telas de imóveis (lista, novo, editar)`.

### Task 8: Roteiro de QA, verificação e spec

**Files:**
- Modify: `layers/gestao/test/qa/fluxos.md` (F17 e a linha 30 do F1, que ainda diz «mostra `em-breve`»)
- Modify: `docs/superpowers/specs/2026-11-17-gestao-telas-mock-design.md` (item 8: «feito, espelho do catálogo»)

- [ ] **Step 1:** Reescrever F17 com passos executáveis: lista (5 imóveis, selos), corretor `c1` não vê `im-102` nem abre pela URL, criar imóvel completo como corretor (fica com ele como vendedor e «No site»), validações da Task 2, editar sem acusar duplicado, status e destaque, 7ª foto recusada, capa/ordem/remover, excluir bloqueado com locação em andamento, excluir permitido sem locação, Nova locação lista só `aluguel`, persistência ao recarregar.
- [ ] **Step 2:** Rodar `pnpm typecheck && pnpm test` → tudo PASS (reportar a saída real).
- [ ] **Step 3:** Subir o painel em modo demo (`NUXT_PUBLIC_GESTAO_ENABLED=true NUXT_PUBLIC_GESTAO_DEMO=true pnpm dev`) e percorrer os passos 1–4 e 7 do roteiro no navegador; registrar o que falhou.
- [ ] **Step 4: Commit** `docs(gestao): roteiro de QA de imóveis e spec`; **Push** na branch `claude/painel-gestao-desenvolvimento-0numna`.
