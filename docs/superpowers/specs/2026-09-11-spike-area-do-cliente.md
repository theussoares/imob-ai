# Spike — validação de arquitetura da Área do Cliente

**Data:** 2026-09-11
**Motivo:** antes de mexer em RLS, storage e dados pessoais de terceiros, confirmar
que o desenho está certo contra documentação oficial e contra o banco real — não
contra memória.

## Método

O que foi consultado, e como:

- **Documentação do Supabase**, via a API de docs (o domínio está bloqueado pelo
  proxy de rede desta sessão; a consulta foi feita pelo MCP): guias de *Storage
  Access Control*, *Custom Claims & RBAC*, *Column Level Security*, *RLS
  performance* e o lint `0003_auth_rls_initplan`.
- **O banco de produção `imob-ai`** (`eixzfjmmcocuxnprqskf`, ACTIVE_HEALTHY):
  advisors de segurança e performance, e consultas de leitura em
  `information_schema.role_table_grants` e `pg_policies`.
- **O próprio repositório**, para confrontar o que a migration diz com o que o
  código faz.
- **Mercado**, por busca: Kenlo Locação, Asaas, Cora.

O que **não** foi validado está listado no fim. Isso importa tanto quanto o resto.

---

# Parte 1 — Achados em produção

Estes não são hipóteses. Foram verificados por consulta ao banco em 11/09/2026.

## A1 — `properties`: o papel `authenticated` lê a tabela inteira ✅ confirmado

A suspeita registrada no plano de ontem está **confirmada**:

```
grantee        | table_name | privs
authenticated  | properties | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
anon           | properties | DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE
```

`anon` **não** tem `SELECT` de tabela — a proteção da migration 0011 está aplicada,
e as colunas públicas vêm de grant por coluna. `authenticated` **tem**, o que
significa acesso a `owner_name`, `owner_phone`, `location` e `broker_id`.

Hoje isso não vaza nada, porque todo usuário autenticado é membro de imobiliária.
**Deixa de ser verdade no primeiro login de inquilino.**

→ O card **0.2** sobe de "suspeita" para "fato verificado". Continua bloqueante.

## A2 — `brokers_public_read`: policy sem filtro de tenant, e não versionada 🔴

Em produção existe:

```sql
policy brokers_public_read on brokers for select
  using (active = true and public_visible = true)
```

Três problemas:

1. **Não existe em migration nenhuma.** Nem ela, nem `brokers_member_all`, nem a
   coluna `public_visible` que ela usa.
2. **Não filtra por tenant.** Qualquer papel que tenha grant de `SELECT` em
   `brokers` lê corretor de **qualquer** imobiliária.
3. `authenticated` **tem** grant de SELECT em `brokers`.

Estado atual: 7 corretores, 3 tenants, **1 com `public_visible = true`**. Ou seja,
hoje um membro da imobiliária A consegue ler o registro público de corretor da
imobiliária B — nome, telefone, e-mail, CRECI. Raio de alcance pequeno (poucos
usuários de painel), mas a forma do bug é a que interessa.

`anon` está protegido só porque o `revoke all ... from anon` da 0011 tirou o grant.
A policy continua lá: se alguém reconceder `SELECT` a `anon` — um clique no
dashboard, uma migration futura com `grant on all tables` — a tabela abre sozinha.

→ Card novo. E o portal transformaria isso de "staff vê" em "todo cliente de toda
imobiliária vê".

## A3 — `leads`: `anon` tem SELECT, UPDATE e DELETE de tabela ⚠️

```
anon | leads | DELETE,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

Todas as policies de `leads` são gatilhadas por `is_tenant_member`, então **na
prática a RLS segura**. Mas a defesa em profundidade não existe: uma policy escrita
errado no futuro vira exposição de PII de lead imediatamente, sem nenhuma segunda
barreira. A 0011 fez esse `revoke` para `brokers` e `properties`; `leads` ficou de
fora.

## A4 — O drift entre migrations e produção voltou

A migration 0011 foi escrita justamente porque "o banco de produção foi alterado à
mão e as migrations ficaram para trás". A A2 mostra que aconteceu de novo: policy e
coluna existindo só em produção.

Consequência prática: **um ambiente novo — staging, cliente novo, restore — não sobe
igual à produção.** Isso é especialmente perigoso agora, porque o plano inclui subir
um ambiente e testar isolamento entre clientes: os testes rodariam contra um schema
que não é o real.

## A5 — Funções `SECURITY DEFINER` executáveis por RPC

Advisors `0028` e `0029`:

- `public.is_tenant_member(uuid)` — executável por `anon` e `authenticated` via
  `/rest/v1/rpc/is_tenant_member`
- `public.is_member_of_slug(text)` — idem

O vazamento é pequeno (funciona como oráculo de "eu sou membro deste tenant?"), mas
**a minha `is_portal_user()` nasceu com exatamente o mesmo defeito** — escrevi no
mesmo formato. Corrigido nesta rodada.

## A6 — Proteção contra senha vazada desligada

Advisor de segurança. Hoje é quase irrelevante: os usuários são os corretores. Passa
a importar quando o público vira inquilino e proprietário — gente comum, que reusa
senha. Ativar é um toggle no dashboard (checagem contra HaveIBeenPwned).

---

# Parte 2 — Decisões que o spike confirma

## D1 — Tabela própria + função `SECURITY DEFINER` é o padrão oficial ✅

O guia *Custom Claims & Role-based Access Control* do Supabase recomenda exatamente
o que foi feito: uma tabela dedicada referenciando `auth.users` (lá `user_roles`,
aqui `portal_users`), com uma função `security definer` consultada pelas policies
(lá `authorize()`, aqui `is_portal_user()`).

A documentação de *Column Level Security* reforça pelo lado negativo: *"não
recomendamos privilégios por coluna para a maioria dos casos. Em vez disso,
recomendamos policies de RLS combinadas com uma tabela dedicada para papéis."*

→ O desenho está alinhado com a recomendação oficial. Mantido.

## D2 — Papel na relação, não na pessoa ✅

Sem fonte externa a contradizer, e a razão continua de pé: quem aluga um imóvel e é
dono de outro é as duas coisas com uma conta só.

## D3 — Bucket privado ✅

Documentação confirma: bucket privado só entrega arquivo por (a) `download()` com
JWT do usuário, validado por RLS em `storage.objects`, ou (b) URL assinada.

---

# Parte 3 — Decisões que o spike MUDA

## M1 — A autorização do download deve viver também na RLS do storage 🔴 decisão pendente

**Como está desenhado:** o cliente não tem policy de leitura no bucket; o servidor
confere a permissão em código (`canClientSeeDocument`) e assina a URL com service
role.

**O que a documentação mostra:** uma policy de `SELECT` em `storage.objects` pode
fazer join com tabelas da aplicação. Ou seja, **a regra de "é parte do contrato e o
documento é do papel dele" pode ser expressa na própria RLS do storage** — e aí o
cliente baixa direto com o JWT dele, com o banco validando.

Isso remove o ponto único de falha que está escrito no card 2.3: hoje, se alguém
esquecer de chamar `canClientSeeDocument()` antes de assinar, não há segunda
barreira, porque service role ignora RLS.

**Recomendação:** manter o endpoint do servidor (dá trilha de acesso, rate limit e
controle da expiração), **e adicionar a policy de storage** como segunda barreira.
Duas barreiras independentes, uma no código e uma no banco.

### ⚠️ E uma armadilha que veio junto

Dar `SELECT` em `storage.objects` para download **também permite listar o conteúdo
do bucket** — o cliente veria os caminhos dos documentos de todos os contratos de
todos os tenants. A documentação resolve isso com os helpers operacionais
`storage.allow_only_operation()` / `storage.allow_any_operation()`, que distinguem
"ler objeto" de "listar bucket". Se a policy for adicionada, ela **tem** que usar
esses helpers.

## M2 — Trocar privilégio de coluna por tabela separada, em `contracts` 🔴 decisão pendente

A migration 0028 usa `revoke select on contracts from authenticated` + grant por
coluna, para esconder `notes`, `external_id` e `admin_fee_percent`.

Dois problemas, ambos documentados:

1. **O Supabase desaconselha explicitamente privilégio por coluna** e recomenda RLS
   + tabela dedicada.
2. **`select('*')` passa a falhar na tabela inteira.** A documentação diz: *"papéis
   restritos não podem usar o operador curinga; todas as operações e o `select *`
   vão falhar."*

O ponto 2 não é teórico neste repositório. `server/repositories/property.repository.ts`
já carrega o comentário da vez em que isso aconteceu:

> `select('*')` não pode ser usado nas leituras como anon: o Postgrest expande `*`
> para todas as colunas da tabela (inclusive as internas, com SELECT revogado para
> anon) e a query inteira falha com "permission denied for table properties".

E `listAllProperties` e `getPropertyById` — as duas leituras do painel — usam
`select('*', …)` hoje. É exatamente por isso que o card 0.2 precisa trocar os dois
endpoints para service role **no mesmo deploy** do revoke.

**Recomendação:** para `contracts`, mover os três campos internos para uma tabela
`contract_internal`, protegida por `is_tenant_member`. A RLS faz o trabalho, some a
armadilha do `select('*')`, e o modelo fica mais honesto — "o que é do cliente" e "o
que é da imobiliária" viram tabelas diferentes, não colunas com grant diferente.

**Custo hoje: zero.** A tabela `contracts` não existe em produção ainda.

Para `properties`, a mesma mudança é bem mais cara (dados em produção, código
existente) — ali fica o caminho de grant por coluna + service role, com o custo
conhecido e documentado.

## M3 — Uma policy com `OR`, em vez de duas permissivas ✅ aplicado

Advisor `0006_multiple_permissive_policies`: **30 ocorrências hoje**. Cada policy
permissiva extra roda em toda query da tabela.

A 0028 ia piorar isso, criando `_member_all` + `_self_read` (ou `_party_read`) em
quatro tabelas. Consolidadas em uma policy por ação, com `or`.

## M4 — `(select auth.uid())` e `to authenticated` em toda policy ✅ aplicado

Advisor `0003_auth_rls_initplan` já acusa `tenant_members_self_read` em produção.
A documentação é enfática: chamada solta é avaliada **uma vez por linha**; dentro de
um subselect, uma vez por query — *"não há desvantagem em aplicar essa otimização
agressivamente"*.

`to authenticated` faz a policy nem ser avaliada para `anon`.

## M5 — Índice em `portal_document_access.portal_user_id` ✅ aplicado

Advisor `0001_unindexed_foreign_keys` já lista 7 casos em produção. Esta FK nova
entraria como o oitavo.

## M6 — `revoke execute` em `is_portal_user` ✅ aplicado

Corrige o A5 para a função nova, antes de ela existir.

---

# Parte 4 — Uma decisão deliberadamente NÃO tomada

## Custom Access Token Hook (papel dentro do JWT)

A documentação de RBAC mostra o caminho: um hook que injeta o papel como claim no
JWT, e policies que leem `auth.jwt() ->> 'user_role'` em vez de consultar tabela.
Ganho real de performance — some a consulta por avaliação de policy.

**Não adotar agora, e o motivo não é esforço: é semântica de revogação.**

O claim é gravado no token no momento da emissão. Desativar um cliente
(`active = false`) deixaria de ter efeito imediato — ele continuaria entrando até o
token expirar. O critério de aceite do card 1.2 diz "desativar cliente bloqueia o
login imediatamente", e isso é o comportamento certo para dado de contrato.

Com 10 contratos, a consulta por policy não é gargalo. Fica registrado como a saída
para quando for — e com o preço explícito.

---

# Parte 5 — LGPD

> Levantamento de desenvolvedor, não parecer jurídico. Antes de abrir para clientes
> reais, isso precisa passar por advogado.

- **Base legal durante o contrato:** execução de contrato. Não depende de
  consentimento — o dado é necessário para a relação existir.
- **Base legal muda quando o contrato encerra.** A literatura do setor é consistente
  nisso: entregues as chaves, a execução de contrato deixa de sustentar o
  tratamento, e o que resta é cumprimento de obrigação legal ou exercício regular de
  direitos.
- **Retenção não pode ser eterna.** O parâmetro recomendado são os prazos
  prescricionais civis. Isso precisa virar número no sistema, não intenção — e é o
  que o card 3.2 pede.
- **A trilha de acesso é o instrumento de accountability.** `portal_document_access`
  existe para responder "quem acessou meu contrato?" — pergunta que não pode ser
  respondida retroativamente se não estiver sendo gravada desde o primeiro dia.

Implicação de desenho já contemplada: desativar cliente **não** apaga histórico.
Direito à eliminação e dever de retenção convivem, e quem decide o recorte é
jurídico, não a tela.

---

# Parte 6 — Mercado

Levantado nas conversas dos últimos dois dias, consolidado aqui:

- **Kenlo Locação** tem tudo nativo: boleto mensal com água, energia e condomínio,
  repasse, inadimplência, nota fiscal, e app onde locatário e proprietário pegam
  boleto e extrato. 8.500 imobiliárias, 400 mil contratos.
- **Mas o "nativo" do Kenlo é integração**: eles anunciam integração com mais de 34
  bancos. Não viraram banco — plugaram no banco da imobiliária, 34 vezes.
- **Emitir com antecedência e enviar sozinho é configuração de gateway**, não
  engenharia. Asaas e Cora fazem cobrança recorrente com geração antecipada e envio
  automático por e-mail, SMS e WhatsApp, com lembrete antes e depois do vencimento.
- **Kenlo e Superlógica cobram por contrato administrado.** Para imobiliária
  pequena, isso é caro e o sistema é grande demais.

**Conclusão de posicionamento:** a diferença real entre o imob-ai e o Kenlo nunca foi
o boleto — é o ciclo financeiro depois que o dinheiro entra (repasse, IRRF, DIMOB).
E o degrau que eles não defendem é a imobiliária pequena, que eles servem mal.

---

# Parte 7 — Impacto nos cards

| Card | Impacto |
|---|---|
| **0.2** Blindar `properties` | Sobe de suspeita a **fato verificado**. Sem mudança de escopo. |
| **0.3** Mappers e repositories | ⚠️ **Nunca usar `select('*')` em `contracts`** enquanto houver grant por coluna. Se M2 for aceito, a restrição some. |
| **1.3** Publicação de documentos | Se M1 for aceito, entra a policy de storage com os helpers operacionais. |
| **2.3** Download assinado | Se M1 for aceito, deixa de ter ponto único de falha. O critério de aceite ganha "listar o bucket não retorna objeto de outro contrato". |
| **3.1** Testes de isolamento | Ganha caso novo: leitura cross-tenant de `brokers`. |
| **3.2** Segurança e LGPD | Ganha: ativar proteção de senha vazada; `revoke execute` nas funções antigas; `revoke` em `leads`; rodar os advisors como gate. |
| **NOVO** | Remover `brokers_public_read` e versionar o drift (A2, A4). |
| **NOVO** | Reconciliar migrations com produção antes de subir staging (A4). |

---

# Parte 8 — O que este spike NÃO validou

Honestidade sobre o alcance:

- **Nada foi testado em execução.** As policies novas não rodaram contra um banco —
  a migration 0028 segue sem ser aplicada em lugar nenhum. Tudo aqui é leitura de
  documentação, dos advisors e do schema atual.
- **A policy de storage da M1 não foi escrita nem testada.** Sei pela documentação
  que o join é possível; não provei que a expressão específica funciona e performa.
- **A parte de LGPD não tem validação jurídica.**
- **Preços de gateway e planos podem ter mudado.** Foram conferidos por busca, não
  por contrato.
- **Não foi feita análise de custo de infraestrutura** do storage privado com o
  volume projetado.
- **Não foi avaliado o comportamento de sessão dupla** (painel + portal no mesmo
  navegador) na prática — é premissa do card 0.5, baseada em como o `storageKey`
  funciona, não em teste.
