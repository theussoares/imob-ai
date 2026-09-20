# E2E da Área do Cliente

**Data:** 2026-09-20
**Motivo:** a regra que decide quem vê cada documento existe em **dois** lugares,
de propósito. Em TypeScript, `canClientSeeDocument`
([portal-access.ts](../../../shared/utils/portal-access.ts)); e em SQL, nas
policies da 0028 — `portal_documents_read` e `portal client reads own documents`
no bucket. O comentário do
[download](../../../server/api/portal/documentos/%5Bid%5D/download.post.ts) diz
por que são duas: "a regra é aplicada duas vezes, em dois lugares que falham de
formas diferentes".

Só que **nada verifica que as duas concordam.** Os testes de hoje cobrem cada
lado isolado: `portal-access.test.ts` exercita a função pura,
`portal-document.repository.test.ts` usa `fakeSupabase`. Nenhum deles toca uma
policy de verdade. A concordância entre as duas barreiras é afirmada nos
comentários e nunca medida.

O buraco importa porque o modo de falha é silencioso e caro: as duas discordando
para o lado permissivo mostra ao inquilino o extrato de repasse do proprietário —
quanto ele recebe — ou o contrato de administração, que no contrato real que
modelou a feature traz a taxa de administração, a conta bancária e o Pix pessoal
dele.

Some-se a isso que o papel **fiador não tem um único dado no banco**. Nos quatro
tenants não existe uma linha de `contract_parties` com `role = 'fiador'`. É o
papel de audiência mais restrita e o único cujo caminho nunca rodou.

## Escopo

Uma suíte Playwright local que percorre a jornada completa — a imobiliária
publicando documento pelo painel, e inquilino, proprietário e fiador entrando
para ver o que lhes cabe — contra um tenant descartável, sem nenhuma credencial
humana envolvida.

**O que ela prova que hoje nada prova:** sessão real → RLS real → URL assinada
real, com a contagem exata do que cada papel enxerga.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `pnpm test:e2e`, fora de `pnpm test` | integrar no comando único | o `vitest.config.ts` registra a recusa do ambiente Nuxt porque "teste lento é teste que ninguém roda"; enfiar um browser no comando de segundos revoga essa decisão sem discutir |
| tenant `e2e-<runid>` por execução | tenant `e2e` fixo por migration | `resolveTenantForHost` resolve subdomínio da plataforma e `*.usemoradi.com.br` está na Vercel: um tenant fixo vira **site público** em `e2e.usemoradi.com.br` |
| tenant por execução | condicionar o host a `VERCEL_ENV` no middleware | poria condição de ambiente no caminho mais quente do site, que é a resolução de tenant |
| varredura de `e2e-*` antigos no setup | só teardown no fim | um `Ctrl+C` no meio deixa tenant órfão permanente no banco de clientes reais; uma execução interrompida basta para o desenho falhar |
| interface só onde a tela decide audiência | tudo pela interface | suíte que reprova por seletor de botão treina a equipe a responder "é o teste de novo" — e esta precisa significar uma coisa só quando fica vermelha |
| interface para upload + audiência + publicar | semear tudo por API | é ali que a imobiliária DECIDE quem vê; semear por API testaria a regra sem testar a escolha |
| contagem exata do que cada papel vê | `toContain` do que deve ver | `toContain` passa feliz com um documento a mais, que é exatamente o defeito |
| senha gerada pelo próprio teste | senha em `.env` ou `storageState` | nenhuma credencial humana em lugar nenhum, e nada que expire entre execuções |
| `definir-senha` por token trocado em sessão, **uma vez** | pular a tela; ou repetir nos três papéis | exercita o ramo real da página sem e-mail nem allowlist do Supabase; repetir provaria o mesmo três vezes |
| **um** documento subido pela interface | os seis pela interface | a regra dos outros já está na matriz; seis uploads só compram tempo de execução |
| tenant próprio em vez de usar a `demo` | reusar os dados da `demo` | a `demo` é o que ele mostra ao cliente; teardown que falhe deixa lixo numa base de demonstração |

## A. Ciclo de vida do tenant

`globalSetup` cria, por service role:

1. o tenant `e2e-<runid>`, com `slug` e `name` carregando o mesmo id;
2. as linhas de `tenant_features` que a suíte precisa (`portal` ligado);
3. um membro de painel (conta no Auth + `tenant_members`);
4. três clientes de portal — inquilino, proprietário e fiador;
5. um contrato com as três partes.

`globalTeardown` apaga o tenant. O cascade de `tenant_id` leva contratos,
partes, documentos e trilha. **Os objetos do bucket saem por chamada explícita:**
storage não participa do cascade, e o comentário da 0028 já avisa que o bucket é
território à parte.

Antes de qualquer criação, o setup varre `slug like 'e2e-%'` com
`created_at < now() - interval '1 hour'` e apaga. É a segunda rede, e existe
porque a primeira falha no dia em que alguém interrompe a execução.

## B. A linha de corte entre interface e API

O critério é uma pergunta: **esta tela decide quem vê o quê?**

| Passo | Como | Por quê |
|---|---|---|
| criar tenant, contas, contrato, partes | API | andaime, sem regra que um vazamento dependa |
| subir documento, escolher audiência, publicar | **interface** | é a decisão de audiência sendo tomada |
| definir senha pelo link | **interface** | tela gêmea da do painel; um convite caindo na errada já passou despercebido |
| entrar como cada papel e listar | **interface** | é a regra sendo aplicada |
| baixar documento do outro papel por id | API | a asserção é sobre o status, não sobre a tela |

### Quantas vezes, e para quem

O corte acima diz QUAIS passos passam pela interface; estes dois diriam respeito
a quantas repetições, e sem isso um implementador teria que adivinhar.

**Definir senha: uma vez, no fiador.** A tela é a mesma para os três papéis e
repetir provaria o mesmo três vezes. Vai no fiador porque é o papel sem nenhum
dado hoje — o único cujo cadastro nasce inteiro dentro do teste. Inquilino e
proprietário são criados já com senha, por `auth.admin.createUser`.

**Upload pela interface: um documento, o contrato de administração.** É o de
audiência mais estreita e maior aposta, e o único em que errar a caixinha expõe
conta bancária e Pix do proprietário ao inquilino. O teste confere que a frase
de `describeAudience` na tela diz "Só o proprietário vê" **antes** de publicar —
é a consequência aparecendo no momento da escolha, que é a razão de a frase
existir. Os outros cinco documentos são semeados por API: a regra deles já está
coberta pela matriz, e subir seis arquivos pela interface só compraria tempo de
execução.

## C. A matriz

Um contrato com os três papéis e seis documentos, cobrindo os defaults de
`defaultAudienceFor`:

| documento | audiência | inquilino | proprietário | fiador |
|---|---|:-:|:-:|:-:|
| Contrato de locação | inq+prop+fiador | vê | vê | vê |
| Vistoria de entrada | inq+prop+fiador | vê | vê | vê |
| Boleto | inquilino | vê | — | — |
| Extrato de repasse | proprietário | — | vê | — |
| Contrato de administração | proprietário | — | vê | — |
| Recibo (rascunho) | inquilino | — | — | — |

Asserção: inquilino vê **exatamente 3**, proprietário **4**, fiador **2**, e o
rascunho não aparece para ninguém.

### As três que fixam decisão de produto

- **Download cruzado por id** — o inquilino faz `POST` no id do extrato e recebe
  **404, não 403**. Um 403 confirmaria que o documento existe a quem trocou o id
  na URL.
- **Acesso desativado** — com `active = false`, a tela precisa mandar falar com
  a imobiliária. "Credenciais inválidas" faria a pessoa tentar a senha para
  sempre.
- **Recurso desligado** — 403 com mensagem legível que **não menciona
  pagamento**. Expor a inadimplência da imobiliária aos clientes dela é dano à
  imagem de terceiro, e é decisão fácil de regredir sem ninguém notar.

## Fora do escopo, por decisão

- **E-mail real e remetente por tenant.** Dependeria de provedor externo, e
  teste que falha por motivo alheio ensina a equipe a ignorar teste. O caminho
  do token é exercitado sem a caixa de entrada.
- **Isolamento entre tenants.** Já coberto por `portal-isolation.test.ts` em
  Node puro, em milissegundos. Repetir no browser é mais caro e pior.
- **CI.** Não existe GitHub Actions no repositório. Ligar isso é decisão
  separada, com custo próprio.
- **O resto do painel** — imóveis, leads, corretores. O corte é a regra de
  audiência.

## Riscos aceitos

**A suíte escreve no banco dos clientes reais.** Dev e produção dividem o projeto
`eixzfjmmcocuxnprqskf`, e não há como contornar isso sem um segundo projeto
Supabase — que foi pesado e recusado pelo custo (39 migrations, outro conjunto de
env vars, outro `.env`).

O tenant descartável reduz o estrago a algo apagável e o `tenant_id` isola pelo
mesmo mecanismo que o produto já garante. Mas **nenhum teardown é perfeito**: uma
falha dele com a varredura também quebrada deixaria tenant órfão. É o ponto deste
desenho em que estaríamos errados se estivéssemos errados.

Mitigação que NÃO adotamos e vale registrar: rodar contra um Supabase local via
CLI. Foi descartado porque as migrations precisariam rodar limpas num banco
zerado — o que nunca foi testado neste repositório — e porque o objetivo é
exercitar as policies **como estão em produção**, não como o arquivo diz que
deveriam estar. Um E2E contra um banco reconstruído provaria a migration, não o
ambiente.

## Pendente fora do código

Nada. A suíte se provisiona sozinha e não exige configuração manual no Supabase
nem na Vercel.
