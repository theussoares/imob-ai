# Descrição de imóvel por IA

**Data:** 2026-09-22
**Motivo:** o painel pede uma descrição que ninguém quer escrever. O resultado
está no acervo: imóvel publicado com `description` vazia ou com três linhas
genéricas. Isso custa duas vezes — o anúncio converte menos, e o catálogo fica
pobre justamente na parte que alimenta busca por LLM, que é onde este produto
aposta o diferencial (ver a memória de roadmap de 20/08).

E há relógio. A pesquisa de concorrentes de agosto mostrou que **descrição por
IA já é commodity em 2026**: o concorrente mais barato pesquisado (Tecimob,
R$ 129,90/mês) já entrega. Não é diferencial de médio prazo, é paridade
atrasada.

Não existe hoje nenhuma dependência de LLM no repositório — nem no
`package.json`, nem em `server/`. Esta spec desenha o primeiro caminho de IA da
plataforma, e é por isso que ela gasta mais linhas com a fronteira do provedor e
com o controle de custo do que com o prompt.

## Escopo

Um botão no formulário de imóvel do painel que gera — ou reescreve — a descrição
a partir dos campos já preenchidos, de dicas opcionais do corretor e da foto de
capa. O texto volta para o `textarea`; **quem salva continua sendo o corretor**.

Recurso contratado por imobiliária (`tenant_features`), com cota mensal contada
no banco e consumo registrado linha a linha.

### Fora do escopo, por decisão

| Fora | Por quê |
|---|---|
| **Geração em lote no acervo antigo** | é onde a conta escapa e onde a revisão humana some — e a revisão humana é o que segura a alegação enganosa (ver "Publicidade enganosa" abaixo). Entra quando houver consumo medido para dimensionar o teto |
| **2-3 variações para escolher** | multiplica por 3 o lado caro (saída) e pede UI de comparação; o ganho percebido não paga isso antes de o recurso provar uso |
| **Prompt livre por tenant** | campo de texto do cliente indo direto ao prompt, com o resultado ruim aparecendo no site dele. O tom é lista fechada de três valores |
| **Geração automática ao salvar** | publicaria texto de IA sem ninguém ler, e transformaria todo rascunho e cadastro de teste em chamada paga |
| **Streaming da resposta** | ~300 tokens chegam em 2-4s; streaming pelo Nitro na Vercel custa complexidade real para economizar uma barra de progresso |
| **Prompt caching** | o system prompt tem ~800 tokens, abaixo do prefixo mínimo cacheável do modelo. Ligar `cache_control` não cachearia nada e deixaria no código um comentário afirmando economia que não acontece |
| **Cobertura em `pnpm test:e2e`** | o e2e roda contra o projeto Supabase de produção; gastar dinheiro de verdade por suíte é como se faz ninguém rodar a suíte |

## Custo, que é o motivo de metade das decisões

| item | tokens | custo (Haiku 4.5, US$ 1/MTok entrada, US$ 5/MTok saída) |
|---|---|---|
| foto de capa (~1024×768) | ~1.100 entrada | US$ 0,0011 |
| campos do imóvel + dicas | ~500 entrada | US$ 0,0005 |
| descrição gerada | ~300 saída | US$ 0,0015 |
| **por descrição** | | **~US$ 0,003 (~R$ 0,017)** |

Mil descrições com foto ≈ US$ 3. A foto praticamente dobra a entrada, mas
entrada é o lado barato; quem custa é a saída, e ela não muda com a imagem.

Registro de um desencontro que apareceu no levantamento e que muda a decisão
inteira: **a assinatura do Claude Code e a API são pools separados.** Nenhum
endpoint em produção consome o limite de trabalho de quem desenvolve, nem por
acidente. A escolha entre free tier e pago nunca foi sobre isso — foi sobre
rate limit compartilhado entre tenants, ausência de SLA e uso do prompt para
treino no free tier do Google AI Studio.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| provedor pago barato (Haiku 4.5), chave da plataforma | free tier (Gemini/Groq) | free tier é rate limit compartilhado por TODOS os tenants, sem SLA, mudando sem aviso — e no AI Studio o prompt pode virar treino. A US$ 0,003 por descrição, o que se compra com o pago é previsibilidade |
| fronteira fina em `server/utils/ai.ts` | SDK direto no endpoint | é onde o token é medido **uma vez só** — sem esse número a cota não tem o que contar — e onde o erro do provedor vira status HTTP. Sem ela, a segunda chamada de IA (título, `alt`) traz o próprio tratamento de erro e as duas discordam; é o defeito que `entitlement.ts` documenta ter custado o PR #27 |
| endpoint Nitro em `server/api/admin/` | Edge Function do Supabase | duplicaria resolução de tenant, auth e log fora do Nitro, onde todo o resto do painel já vive |
| ID do modelo em `runtimeConfig` | modelo fixo no código | trocar de modelo vira variável de ambiente, não deploy |
| variável **com prefixo** `NUXT_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY`, como `MAIL_API_KEY` | `mailApiKey` é lido no BUILD: marcar a variável na Vercel não basta, precisa redeploy. Custou uma tarde em 17/09. Com o prefixo, marcar já vale |
| recurso em `tenant_features` (`'ai'`) | incluído para todos | reaproveita `entitlement.ts` inteiro — falha fechado, falha ruidosa, régua de carência — e vira linha de receita em vez de custo difuso |
| cota mensal contada **no banco** | contador em memória | mesmo motivo de `assertSubmitRateLimit`: na Vercel cada requisição pode cair em outra lambda, e um `Map` local só limitaria quem tiver o azar de repetir a instância |
| **a cota falha FECHADA** | falhar aberta, como `assertSubmitRateLimit` | desvio consciente da convenção. Aquele limite protege o formulário do cliente e erra para deixar passar; este protege dinheiro. Falso bloqueio custa um retry, falso passe não tem teto. Alinha com `entitlement.ts`, que falha fechado pelo mesmo motivo |
| linha **reservada antes** da chamada, tokens preenchidos depois, com lock por tenant | gravar depois, mantendo a tabela append-only pura | decisão revertida pela revisão adversarial. Contar depois não serializa nada: N requisições concorrentes leem `count = 0` e passam todas. Detalhe e motivo abaixo |
| a cota conta **tentativa** | contar geração bem-sucedida | também revertida. Se a linha só nasce no sucesso, um loop de chamadas que falham é invisível para os dois freios — inclusive para o por-minuto, escrito exatamente para esse caso |
| mês da cota recortado em `America/Sao_Paulo` | `date_trunc` em UTC | em UTC a cota vira às 21h do último dia do mês no horário de Campo Grande, e ninguém consegue explicar isso ao cliente |
| cota como constante no código | coluna `quota_monthly` em `tenant_features` | o número vai mudar algumas vezes antes do primeiro cliente reclamar, e enquanto não houver plano com cota diferente por cliente a coluna é campo para alguém preencher errado. Virar coluna depois é migration barata |
| uma linha por geração | contador agregado por tenant/mês | o detalhe por geração é o que responde "quem gerou o quê" quando um cliente reclamar do texto de um imóvel |
| prompt proíbe markdown na saída **e** o catálogo escapa na hora de montar | só uma das duas | `server/utils/markdown.ts:55` e `:116` injetam `description` cru no documento servido em `Accept: text/markdown` e no `llms.txt`. Uma descrição gerada com `## ` reestrutura justamente o artefato que sustenta a aposta de GEO. Prompt não é garantia; escape sozinho não impede o texto feio no site |
| `property_id` com `on delete set null` | `on delete cascade` | apagar o imóvel não pode apagar o registro de consumo: ele é base de cobrança, não metadado do imóvel |
| campos do formulário vêm no **body**; o id do imóvel vem **só da rota** | endpoint lê o imóvel do banco pelo id / id também no body | o momento natural de gerar é durante o cadastro, quando a rota é `/novo` e não há linha no banco. Id em dois lugares seria duas fontes de verdade para a mesma coisa. O invariante continua intacto: o que nunca vem do body é `tenantId` |
| URL da foto validada contra a origem do Storage | aceitar a URL que vier | sem isso o body escolhe qualquer URL da internet e a busca acontece na infraestrutura do provedor, no crédito da plataforma |
| teto de tamanho por string do body | só as validações do `PUT` | um `title` de 1 MB é bomba de tokens paga pela plataforma |
| tom como **lista fechada** de 3 valores + `check` no banco | texto livre em `tenants` | `'caloroso '` com espaço viraria tom ignorado em silêncio — é o mesmo motivo de `tenant_features_feature_check` existir |
| foto entra por URL (`source: {type: "url"}`) | baixar e converter em base64 no servidor | latência e um ponto de falha a mais, por nada |
| o endpoint **não** grava a descrição | salvar junto e devolver o imóvel | é a trava contra alegação enganosa, e ela só vale se não existir caminho que publique sem revisão |
| sem `thinking` na chamada | thinking ligado | copy curta não melhora com raciocínio estendido, e ele adiciona latência e tokens de saída — o lado caro |

## Publicidade enganosa: o risco que a foto traz

Foto faz modelo afirmar o que não existe. "Vista para a serra", "piso
porcelanato", "cozinha planejada" saem com naturalidade de uma imagem ambígua.
Num anúncio imobiliário isso não é erro de texto: é publicidade enganosa
(CDC art. 37), e **quem responde é a imobiliária**, não a plataforma.

Duas travas, e as duas são necessárias:

1. **Hierarquia no prompt.** Os campos estruturados afirmam; a foto só ambienta
   — luminosidade, estilo, sensação do espaço. A imagem não autoriza afirmar
   atributo. Proibições nomeadas, porque "não invente" sozinho não funciona:
   vista, acabamento específico (porcelanato, granito, mármore, planejados),
   andar, posição solar, estado de conservação, proximidade ("a minutos do
   centro"), qualquer número fora dos campos, e condição comercial
   (financiamento, permuta, documentação).
2. **Revisão humana obrigatória por construção.** O endpoint devolve texto; não
   existe caminho que publique sem o corretor ler. É por isso que geração em
   lote ficou fora do escopo.

Regra prática que entra junto: **não escrever o preço no texto.** Ele já aparece
na página, e descrição com preço velho depois de um reajuste é o erro mais
visível que existe num portal.

## Privacidade

`owner_name`, `owner_phone`, `location`, `broker` e `updated_by` **nunca** entram
no prompt. É o invariante 3 do CLAUDE.md, e aqui a falha seria pior que de
costume: o vazamento sairia dentro de um texto cujo destino é a publicação.
Vira asserção de teste, não confiança no revisor.

**Limite conhecido de `tenants.ai_tone`, verificado no banco de produção em
22/09:** o `anon` tem SELECT **de tabela** em `public.tenants`. Portanto
`ai_tone` nasce legível por qualquer um com a anon key, direto no Supabase. Para
três valores de tom isso é inofensivo e a decisão é consciente. No dia em que
alguém quiser um *prompt por tenant* nessa tabela, já não serve: exigiria
`revoke select (coluna)` antes do `grant select (...)`, nessa ordem.

Duas coisas que a mesma consulta revelou e que vale ter escrito, porque as duas
enganam quem ler as migrations:

- os `grant select (coluna) on public.tenants to anon` das migrations 0021, 0022
  e 0029 são **no-ops redundantes** — o grant de tabela já cobria tudo. Quem
  copiar esse padrão achando que está restringindo acesso está enganado;
- adicionar coluna a `tenants` **não** quebra o `select('*')` público, ao
  contrário do que acontece em `properties` (que tem privacidade por coluna de
  verdade, migrations 0005/0011). A assimetria é real; o reflexo de
  "coluna nova exige grant" não se aplica aqui.

## Esquema — migration `0043_descricao_ia.sql`

Três coisas no mesmo arquivo porque são a mesma unidade: o recurso não existe sem
o contador, e o tom não existe sem a constraint.

1. `tenant_features_feature_check` reescrita **com a lista inteira**, não só com
   o valor novo:

   ```sql
   alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
   alter table public.tenant_features
     add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai'));
   ```

   Escrito por extenso de propósito. A constraint hoje é
   `in ('portal', 'about')` (`0039_quem_somos_por_tenant.sql:53`), e "passa a
   aceitar `'ai'`" lido ao pé da letra vira `in ('ai')` — que **desliga Área do
   Cliente e Quem Somos de todo cliente que paga**, em silêncio, com o primeiro
   sinal sendo uma ligação. Nome de recurso é constante de código: a constraint
   existe justamente para que valor errado dê erro em vez de sumir com o
   recurso.
2. `tenants.ai_tone text not null default 'sobrio'`, com
   `check (ai_tone in ('sobrio','caloroso','alto_padrao'))`.
3. `ai_generations`:

```sql
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('descricao')),
  model text not null,
  -- 'reservada' nasce ANTES da chamada; vira 'concluida' ou 'falhou' depois.
  -- A cota conta TENTATIVA, não sucesso — ver a seção de reserva abaixo.
  status text not null default 'reservada'
    check (status in ('reservada', 'concluida', 'falhou')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_tenant_created_idx
  on public.ai_generations (tenant_id, created_at desc);

alter table public.ai_generations enable row level security;
revoke all on public.ai_generations from anon;
```

`kind` existe para que o segundo uso de IA (título, `alt` de imagem, resumo de
lead) não precise de tabela nova. `model` existe para que comparar custo entre
modelos depois seja possível — sem ele, trocar o modelo apaga a linha de base.

**Sem policy nenhuma, deliberadamente.** A única escrita é do servidor por
`serviceSupabase()`, e o painel lê o saldo pelo endpoint, nunca direto. RLS
ligada com zero policies fecha para `authenticated`; o `revoke` fecha para
`anon`, porque o Supabase dá GRANT default e policy sozinha não basta — é o que
a 0011 e a 0028 já fazem em toda tabela interna.

**A função de reserva também é revogada**, e isso é obrigatório, não simetria:

```sql
revoke execute on function public.reservar_geracao_ia(...) from anon, authenticated;
```

Ela é `security definer`, ou seja, roda com os privilégios do dono e ignora a
RLS que acabou de fechar a tabela. Deixá-la com o `grant execute` default do
Postgres entregaria a quem tem a anon key exatamente o que o `revoke all` acima
tirou — e pior, o caminho que *insere* linha de cota.

### A cota reserva antes de chamar — e conta tentativa, não sucesso

**Esta seção reverte duas decisões anteriores desta mesma spec.** A revisão
adversarial derrubou as duas, e o motivo de cada reversão fica registrado porque
o desenho descartado é sedutor.

**Reversão 1 — a tabela não é append-only pura.** A ideia era gravar depois da
resposta, já que é ela que traz a contagem de tokens, aceitando um estouro de
"1-2 cliques simultâneos". Essa conta estava errada: não há serialização nenhuma
entre ler o contador e gravar a linha, e na Vercel as requisições caem em
lambdas diferentes. **N requisições concorrentes leem todas `count = 0` e todas
passam.** Um script com 300 chamadas paralelas contra uma cota de 100 gera 300
chamadas pagas e só é barrado na 301ª. "Append-only puro" era estética; o freio
é requisito.

**Reversão 2 — a cota conta tentativa, não geração bem-sucedida.** Se a linha só
nasce no sucesso, uma sequência de chamadas que falham é invisível para os dois
contadores — inclusive para o limite por minuto, que foi escrito exatamente para
"barrar clique preso e script". Ele nunca dispararia no único cenário que
motivou sua existência. Pior: erro de conexão *depois* de o provedor ter gerado
tokens é cobrado e não seria registrado.

**O desenho que substitui os dois:** uma função no banco, chamada pela service
role, que reserva a vaga e devolve o id — ou nada, se a cota estourou.

```sql
create or replace function public.reservar_geracao_ia(...) returns uuid
language plpgsql security definer as $$
begin
  -- Serializa por tenant. Sem o lock, duas transações concorrentes contam a
  -- mesma coisa e inserem as duas: é a corrida descrita acima, e `insert ...
  -- where (select count(*)) < cota` NÃO a resolve sob READ COMMITTED.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));
  ...conta as linhas do mês e do último minuto; se couber, insere 'reservada'
     e devolve o id; senão devolve null...
end $$;
```

Depois da resposta do provedor, um `update` só nas colunas de token e em
`status`. Linha que fica `'reservada'` para sempre (lambda morta no meio) já
contou como tentativa — que é o comportamento correto para um freio.

**Consequência aceita:** um cliente cujas chamadas estejam todas falhando queima
a cota do mês sem receber nenhum texto. É deliberado — o freio protege o custo,
e chamada que falha às vezes custa igual. O que compensa é o `logError` do
passo 6: falha do provedor grita, e não se descobre pela fatura.

**Fuso:** o mês da cota é recortado em `America/Sao_Paulo`, não em UTC. Sem
isso a cota vira às 21h do último dia do mês, horário de Campo Grande — um
comportamento que ninguém consegue explicar ao cliente. O fuso é constante única
da plataforma, não coluna por tenant: cota é contrato comercial nosso, não
preferência de exibição.

## Fluxo do endpoint

`POST /api/admin/properties/[id]/descricao`

1. `requireTenantMember(event)` — 401/403 já tratados lá.
2. `descricaoIaAtiva(tenant.id)`. `'ai'` entra em `RecursoOpcional` e a função
   reusa `recursoLigado`: **sem segunda leitura de `tenant_features`**, que o
   arquivo marca como invariante. 403 se desligado.
3. Valida o body **montando um objeto novo com as chaves conhecidas** — nunca
   `...body`. Isto não é estilo: os campos do prompt vêm do body, então
   espalhar o objeto faz um `owner_phone` enviado à mão atravessar a validação
   e chegar ao prompt. Limites do `PUT` mais teto por string: título 200,
   descrição atual 2.000, dicas 500, cada diferencial 60, no máximo 30
   diferenciais.

   O id vem da rota: `'novo'` significa imóvel ainda não salvo (a linha de uso
   nasce com `property_id` nulo); qualquer outro id é conferido contra o tenant,
   e imóvel de outra imobiliária é **404**, não 403, para não confirmar
   existência.

   A URL da foto é conferida contra a origem do Storage. **Escopo honesto dessa
   checagem:** ela barra URL de fora da plataforma — que é o que importa, porque
   sem ela o body manda qualquer endereço da internet e a busca acontece na
   infraestrutura do provedor, no crédito da plataforma. Ela **não** impede que
   o tenant A mande a URL de uma foto do tenant B, já que todo mundo divide o
   mesmo host. O impacto disso é baixo (caminhos do Storage têm uuid, não são
   enumeráveis) e fica registrado em vez de ser confundido com isolamento.
4. `reservar_geracao_ia` — a cota, com lock por tenant, contando **tentativas**
   (ver a seção acima). Mês corrente contra `COTA_MENSAL_DESCRICAO` (constante
   em `server/utils/ai.ts`, 100 na v1) e último minuto por `created_by` (teto
   10). Sem id de volta → 429, e nenhuma chamada ao provedor acontece. Erro na
   função → **bloqueia**, falhando fechada.
5. Monta o prompt e chama `gerarTexto`.
6. `update` da linha reservada: tokens e `status`. Falha aqui não derruba a
   resposta — o corretor recebe o texto — mas vai para `logError` com nível
   alto: é consumo real que ficou sem contagem de token.
7. Devolve `{ texto, restanteNoMes }`.

### `server/utils/ai.ts`

```ts
export interface GeracaoIA {
  texto: string
  inputTokens: number
  outputTokens: number
  model: string
}

export async function gerarTexto(opts: {
  system: string
  prompt: string
  imagemUrl?: string | null
  maxTokens?: number   // padrão 600
}): Promise<GeracaoIA>
```

Cliente em singleton preguiçoso no formato de `serviceSupabase()`, inclusive o
`logError` + `throw` quando a chave falta — sem isso o sintoma que chega é "o
botão parou", sem causa. A mensagem do provedor **nunca** chega ao painel:

| Erro do SDK | Resposta | Log |
|---|---|---|
| `RateLimitError` | 429 "Serviço de IA ocupado. Tente em instantes." | `logWarn` |
| `AuthenticationError` | 500 genérico | `logError` — chave errada mata o recurso para todos os clientes que pagam |
| `APIError` / conexão | 502 "Não foi possível gerar agora." | `logError` |

## Prompt

**Entram:** título, tipo, finalidade, bairro, cidade, estado, quartos, suítes,
banheiros, vagas, área, alto padrão, diferenciais, tom do tenant, dicas do
corretor (bloco delimitado, marcado no system prompt como conteúdo e não
instrução) e a foto de capa.

**Saída:** 2-3 parágrafos, 400-700 caracteres, pt-BR, terceira pessoa, sem
emoji, sem caixa alta, sem clichê de portal ("imperdível", "oportunidade
única"), sem preço e **sem markdown** — nada de `#`, `*`, `-` iniciando linha.
Essa última não é preferência de estilo: a descrição é injetada crua no catálogo
markdown de `server/utils/markdown.ts`, e um `## ` gerado reestrutura o
documento que o produto vende como preparo para busca por IA.

**Modo reescrita:** não é um parâmetro. O body carrega `descricaoAtual`; se vier
preenchida, o prompt ganha o bloco de reescrita. Um modo explícito seria um
segundo lugar para a mesma informação discordar do primeiro. Mesma estrutura,
com a descrição atual em bloco à parte e a instrução de preservar todo fato já
presente — **inclusive os que não estão nos
campos estruturados**, porque quem os escreveu foi o corretor, que viu o imóvel.
A trava é contra o modelo inventar, não contra o humano informar.

## Painel

Em `app/pages/admin/imoveis/[id].vue`, acima do `textarea` de descrição: campo
"Dicas para a IA (opcional)" com `maxlength=500`; botão "Gerar com IA", que vira
"Melhorar com IA" quando já existe texto; estado de carregando; **"desfazer"**
ao lado depois de gerar, restaurando o texto anterior. Escolhido em vez de
`ConfirmDialog` porque o diálogo cobra a decisão antes de a pessoa ver o
resultado, que é justamente quando ela não tem como decidir. Abaixo, discreto:
"restam N gerações este mês". Erro vai para `useToast`.

O botão só aparece com o recurso ligado, via `useAdminFeatures` — **conveniência,
não controle de acesso**, a distinção que `features.get.ts` já documenta. Quem
recusa é o endpoint.

Em `/admin/config`, um select com os três tons, gravado por `tenant.put.ts` com
validação contra a mesma lista de `shared/models/ai-tone.ts`.

## Arquivos

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/0043_descricao_ia.sql` | **novo** — constraint, `ai_tone`, `ai_generations` e `reservar_geracao_ia` |
| `server/utils/markdown.ts` | escapa início de linha da `description` |
| `package.json` | `+ @anthropic-ai/sdk` |
| `nuxt.config.ts` | `anthropicApiKey`, `aiModel` em runtimeConfig privado |
| `server/utils/ai.ts` | **novo** — fronteira do provedor |
| `server/utils/entitlement.ts` | `'ai'` em `RecursoOpcional` + `descricaoIaAtiva()` |
| `server/repositories/ai-generation.repository.ts` | **novo** — `contarNoMes`, `contarUltimoMinuto`, `registrar` |
| `server/api/admin/properties/[id]/descricao.post.ts` | **novo** |
| `server/api/admin/features.get.ts` | `+ descricaoIa` |
| `server/api/admin/tenant.put.ts` | aceita e valida `aiTone` |
| `shared/models/ai-generation.ts` | **novo** |
| `shared/models/ai-tone.ts` | **novo** — lista fechada + rótulos |
| `app/pages/admin/imoveis/[id].vue` | botão, dicas, desfazer, saldo |
| `app/pages/admin/config.vue` | select de tom |
| `app/composables/useAdminFeatures.ts` | `+ descricaoIa` |

O repository existe em vez de um `.from()` no endpoint pela regra do CLAUDE.md —
client por parâmetro, para o teste rodar com `fakeSupabase` sem subir nada.

## Testes

| Teste | Ameaça que documenta |
|---|---|
| prompt nunca contém `owner_name`, `owner_phone`, `location` — **atacando o endpoint com esses campos no body**, não só o montador puro | o invariante 3 falhando num texto destinado à publicação. É o teste central, e ele precisa exercer o caminho real do dado: testar só o montador passaria verde com um `...body` vazando no meio |
| reserva falha → **bloqueia** | o desvio deliberado de `assertSubmitRateLimit`. Sem o teste, alguém "corrige" para falhar aberto por consistência e desliga o freio |
| cota atingida → 429 e a chamada ao provedor **não acontece** | contar depois de gastar não é cota |
| chamada que falha consome a reserva | o loop de erro passando invisível pelos dois contadores |
| duas reservas concorrentes no limite da cota → só uma passa | a corrida que o desenho anterior chamava de "ruído" e que na verdade não tinha teto |
| descrição com `## ` não vira heading no catálogo markdown | corrupção do artefato de GEO pelo texto gerado |
| entitlement desligado → 403 | recurso pago acessível por URL direta |
| URL de foto fora da origem do Storage → recusa | busca de URL arbitrária na conta da plataforma |
| string do body acima do teto → 400 | bomba de tokens |
| id de rota de outra imobiliária → 404 | vazamento entre tenants, e sem confirmar existência |
| rota `/novo` → gera, e a linha de uso nasce com `property_id` nulo | o caminho do cadastro quebrando por falta de linha no banco |
| tom inválido no banco → cai em `sobrio` | constraint burlada por escrita manual virando prompt quebrado |
| guardrail: `aiTone` fora do payload público de tenant | coluna interna nova em tabela pública |
