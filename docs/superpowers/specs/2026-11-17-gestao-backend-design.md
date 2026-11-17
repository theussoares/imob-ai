# Painel de gestão — backend real

Continuação de `2026-11-15-painel-gestao-design.md`, `2026-11-16-gestao-locacao-design.md`,
`2026-11-17-gestao-telas-mock-design.md` e `2026-11-17-gestao-imoveis-espelho-design.md`.

## Motivo

Todas as telas do `/gestao` existem em mock (localStorage + seed + `mocker-nuxt`) e foram validadas pela
Olmi. O próximo passo, decidido em 17/11, é o backend real: login de verdade, dados no Supabase, arquivos
no Storage, permissões checadas no servidor. As regras já moram em módulos puros
(`layers/gestao/domain`), escritos para migrar para o servidor sem reescrita.

## Escopo

1. **Acesso:** convite por e-mail → senha forte → login e-mail + senha → código de 6 dígitos por e-mail
   (2º fator) → sessão. Quatro perfis (`corretor | recepcao | juridico | dono`), corretor ligado a um
   `brokers.id`.
2. **Permissões no servidor:** matriz por tenant (editável em «Usuários e permissões»), checada em todo
   endpoint com as mesmas funções de `domain/permissions.ts`.
3. **Vendas** (processo de 8 etapas, comissão, adiantamentos, conferência, arquivar).
4. **Documentos** em bucket privado, com versões, lixeira e URL assinada curta.
5. **Locação** (8 etapas, garantia, vistoria, contrato, cobranças e repasses **registrados**, renovar,
   encerrar, arquivar).
6. **Imóveis = espelho do catálogo:** o gestão grava em `properties` (mesmo repository do `/admin`).
7. **Financeiro, Dashboard, Auditoria, Configurações, Consulta cadastral (simulada)** lidos/gravados no
   servidor.
8. **Troca do mock pelo HTTP no front** atrás das interfaces de repository, com chave
   `NUXT_PUBLIC_GESTAO_BACKEND = mock | http` (padrão `mock` até a Olmi validar).

## Fora do escopo por decisão

- Cobrança real (Asaas), consulta real SPC/Serasa, WhatsApp: continuam simuladas/registradas.
- Turnstile real: o componente `GestaoCaptcha` segue com o desafio do demo; o servidor aceita um
  verificador plugável e, sem chave configurada, usa limite de taxa por IP e por conta. Ligar o Turnstile
  exige revisar `privacidade.vue` (CLAUDE.md, LGPD) — fica para quando a chave existir.
- Ligar a locação do gestão à tabela `contracts` do `/admin`/portal: ver «Minhas calls».
- **Aplicar migration em produção.** Develop e produção dividem o banco; as migrations ficam escritas e
  testadas no repositório e são aplicadas pelo dono do projeto, uma por vez, conferindo o banco
  (`supabase/migrations/README.md`).

## Approaches

| Abordagem | Resultado |
|---|---|
| 1. Tabela por agregado (`gestao_vendas`, `gestao_locacoes`) com colunas de filtro/escopo e o resto em `jsonb` validado por Zod; o servidor roda as **mesmas ações puras** do domínio sobre o agregado carregado | **Escolhida** |
| 2. Modelo totalmente normalizado (pessoas, adiantamentos, cobranças, eventos em tabelas próprias) | Descartada agora: reescreve o domínio aprovado, multiplica migrations e endpoints; dá para normalizar uma parte depois (ex.: cobranças) sem mudar a API |
| 3. Endpoint genérico «salvar estado inteiro» vindo do cliente | Descartada: o cliente decidiria o resultado das regras (permissão, comissão, status final) — a regra precisa rodar no servidor |

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Usuários do gestão em `gestao_members` (`tenant_id`, `user_id`, `perfil`, `broker_id`, `nome`), separada de `tenant_members` | Ampliar `tenant_members.role` | `tenant_members` dá acesso ao `/admin` (CRM, cobrança). Corretor e recepção não podem herdar isso |
| `requireGestaoMember(event)` em `server/utils/gestao-auth.ts`: Bearer do Supabase + linha em `gestao_members` + recurso `gestao` em `tenant_features` + 2º fator cumprido | Reusar `requireTenantMember` | Perfil e corretor vêm do banco, nunca do body; o gate do recurso fica no servidor |
| 2º fator: tabela `gestao_otp` (hash SHA-256 com pepper do servidor, 10 min, 5 tentativas, bloqueio de 15 min, reenvio após 60 s, uso único). Cumprido = linha `gestao_sessions` (id da sessão do JWT `session_id`, `verified_at`) | Supabase MFA TOTP | Pedido do cliente: código por e-mail. Amarrar ao `session_id` do JWT faz o refresh herdar o 2º fator e um novo login exigir outro código |
| Ações como `POST /api/gestao/vendas/:id/acoes` `{ acao, dados }`: carrega o agregado, checa permissão, roda a função pura de `domain/acoes*.ts`, grava com `versao` (concorrência otimista: `update … where versao = $v`; conflito → 409) | Um endpoint REST por campo | O domínio já é `(Estado, …, Ator) => Resultado`; um despachante tipado mantém uma regra num lugar só |
| `Ator.nome` e `quando` vêm do servidor (membro logado, relógio do servidor) | Do cliente | Histórico é auditoria |
| Documentos: bucket privado `gestao-docs`, caminho `tenant_id/<tipo>/<agregado>/<doc>/<versao>`; tabela `gestao_documentos`; download só por URL assinada de 60 s após checar permissão | Bucket público como `property-images` | RG, CPF e certidões são dado pessoal sensível |
| Upload: o servidor emite URL de upload assinada (`createSignedUploadUrl`) depois de checar permissão e tipo/tamanho; o cliente sobe direto; o servidor confirma e registra | Arquivo passando pela função da Vercel | Limite de corpo da função (4,5 MB) e custo de banda |
| Imóveis do gestão usam `property.repository.ts` (`createProperty`, `updateProperty`…) e o `brokerId` do membro; corretor só mexe nos seus | Tabela própria | Spec do espelho: um cadastro só |
| Matriz de permissões e configurações por tenant em `gestao_settings` (`matriz jsonb`, `config jsonb`), com padrão do domínio quando não há linha | Constante no código | A tela «Usuários e permissões» já edita a matriz |
| Auditoria: os `hist` dos agregados seguem como estão (é o que a tela lê) **e** cada ação grava `gestao_eventos` append-only (`ator_user_id`, `acao`, `alvo`, `quando`) | Só o `hist` em jsonb | `hist` é editável junto com o agregado; auditoria precisa de algo que só cresce |
| Todas as tabelas novas: RLS ligada sem policy para `anon`/`authenticated`, `revoke all from anon, authenticated`; acesso só por `serviceSupabase()` com `tenant_id` no `where` | Policies por papel | O painel é servidor; menos superfície. Guardrail de payload ganha as tabelas novas |
| Front: `GestaoRepository` (vendas, locações, documentos, config, usuários) + `ImoveisRepository` existente, com `Mock*` e `Http*`; escolha por `NUXT_PUBLIC_GESTAO_BACKEND` | Reescrever o store | Tela não muda; dá para voltar ao mock na apresentação |

## Minhas calls (revise)

- **Locação do gestão separada de `contracts`** nesta fase. `contracts` serve o portal do cliente e a
  cobrança Asaas; misturar agora acopla o fluxo de 8 etapas ao portal. Ligar os dois (a locação ativa
  gerar/atualizar um `contracts`) é a primeira fatia depois desta.
- **Excluir processo/locação não existe** (só arquivar), como no mock.
- **Consulta cadastral** grava a consulta simulada (quem, quando, documento consultado mascarado) para a
  auditoria; o resultado continua simulado.
- **E-mail do código** sai pelo `mailer.ts` com o remetente do tenant (`mail-sender.ts`).
- **Migrations numeradas a partir de 0059**, uma por fase, para as sessões não colidirem.

## Fases (cada uma uma sessão; ordem por dependência)

| Fase | Conteúdo | Depende de |
|---|---|---|
| F1 Fundação e acesso | migration 0059 (`gestao_members`, `gestao_otp`, `gestao_sessions`, `gestao_settings`, `gestao_eventos`), `gestao-auth.ts`, endpoints de convite/aceite/login/OTP/sessão/membros/matriz/config | — |
| F2 Vendas | migration 0060 (`gestao_vendas`), repository + mapper + despachante de ações, endpoints | F1 |
| F3 Documentos | migration 0061 (`gestao_documentos`, bucket `gestao-docs`), upload/download assinados, lixeira | F1 |
| F4 Locação | migration 0062 (`gestao_locacoes`), despachante de ações, endpoints | F1 |
| F5 Imóveis | endpoints `/api/gestao/imoveis/**` sobre `property.repository.ts` + fotos no `property-images` | F1 |
| F6 Leituras agregadas | financeiro, dashboard, auditoria, consulta | F2, F4 |
| F7 Front HTTP | `Http*Repository`, `useGestaoAuth` real, chave `GESTAO_BACKEND` | F1–F6 |

## Fica para quem constrói

Nome exato das rotas e dos tipos de payload, paginação (limite fixo de 200 por lista nesta fase), e o
formato do e-mail do código.
