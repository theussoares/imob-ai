# Modelo de dados financeiro

**Data:** 2026-09-21
**Motivo:** hoje não existe **nenhuma** tabela financeira no banco. Há valores
guardados — `contracts.rent_amount`, `contract_internal.admin_fee_percent`,
`portal_documents.amount` e `due_on` —, mas nenhum registro de que alguém **deve**
algo a alguém. O `amount` de um documento é metadado de um PDF, não obrigação.

A consequência aparece na Área do Cliente: **tudo que ela entrega é documento,
nada é transação.** A imobiliária continua produzindo e subindo cada boleto e
cada extrato, um por um. O ganho que justifica um portal de autoatendimento —
reduzir o trabalho da imobiliária, não só a ligação do cliente — não existe
enquanto a geração for manual.

Esta spec **não** constrói essa geração. Ela desenha o lugar onde ela vai morar,
antes de existir dinheiro no sistema, enquanto migrar custa zero.

## Escopo

Seis tabelas vazias, com RLS e grants, sem nenhuma lógica de negócio, endpoint
ou tela. O critério de sucesso é um só: **quando o primeiro boleto existir, não
haverá migração de dado a fazer.**

O modelo precisa acomodar, sem reestruturação, os três jeitos de operar o
dinheiro que estão em aberto:

1. a imobiliária recebe na conta dela e repassa por fora (o sistema **registra**);
2. o sistema emite a cobrança e concilia a liquidação (o sistema **sabe**);
3. split automático via conta digital (o sistema **comanda**).

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `numeric(12,2)` para valor, `numeric(5,2)` para percentual | centavos em `bigint` | o repo já é consistente nisso (`rent_amount`, `amount`, `price`); inteiro exigiria conversão em toda leitura e relatório, e o volume não paga o atrito |
| dois ciclos separados: cobrança e repasse | uma tabela de "movimento" com campo de tipo | cobrar e repassar têm calendários e contrapartes diferentes; colunas específicas de cada lado ficariam nulas em metade das linhas, e toda consulta começaria filtrando por tipo |
| liquidação como **linha própria** | `paid_at` / `paid_amount` no cabeçalho da cobrança | é o que compra os três modelos de operação sem migração — e resolve pagamento parcial, que em coluna não tem onde ir |
| `idempotency_key` única, determinística (`provedor:id_evento`) | confiar em `external_ref` sozinho | um webhook reenviado duplicaria pagamento; índice único é a proteção que as referências tratam como obrigatória |
| append-only nas linhas de valor; correção é estorno | `update` na linha errada | o extrato conta a história real, e a trilha vale como prova; editar dinheiro liquidado deixa a reconciliação ambígua |
| os cabeçalhos aceitam `canceled_at` | cancelar via itens que somam zero | cancelada e corrigida-a-zero são coisas diferentes para quem opera, e uma cobrança cancelada precisa parar de aparecer como devida |
| `owner_payouts.paid_at` no próprio cabeçalho | tabela de liquidação de repasse, espelhando a da cobrança | assimetria real do negócio: o inquilino paga em parcelas, a imobiliária transfere **uma vez**. Se repasse parcial aparecer, vira tabela — e aí é `add table`, não migração |
| FK composta `(pai_id, tenant_id)` nas tabelas de item | FK simples só pelo id do pai | sem ela, uma linha poderia ter `tenant_id` de A com pai do tenant B — e a invariante #1 do repo cairia dentro da própria tabela que deveria respeitá-la |
| valores **assinados** nos itens | coluna de valor + coluna de sinal, ou `kind` decidindo o sinal | desconto, abatimento e estorno são o mesmo mecanismo; separar multiplicaria os caminhos de soma |
| **os dois**: `issued_amount` congelado no cabeçalho **e** total corrente derivado dos itens | só um dos dois | são coisas diferentes e eu tratava como uma. `issued_amount` é o que foi **emitido** — o valor impresso no boleto, que não pode mudar. O derivado é o que se **deve hoje**, depois de estornos. Com append-only a soma dos itens muda; ela não serve de retrato |
| `payout_destinations` é tabela | colunas de Pix/conta em `portal_users` | a mesma pessoa tem destinos diferentes por contrato, destinos mudam, e **um repasse passado precisa continuar apontando para o destino que usou** |
| `holder_name` / `holder_doc` no destino | assumir titular = proprietário | a conta é frequentemente do cônjuge, do espólio ou de quem tem procuração; assumir quebra no primeiro inventário |
| `tenant_id` também nas tabelas de item | herdar pelo pai | é o que `portal_documents` já faz, e torna a policy direta em vez de um join |
| moeda implícita (BRL) | coluna de moeda em toda linha, como as referências recomendam | produto de um país só; internacionalizar seria `add column` com default, não reprocessamento |
| o portal **não lê** estas tabelas na v1 | expor extrato calculado ao cliente já | mantém a primeira migration pequena e sem superfície nova diante do cliente; o extrato segue chegando como PDF pelo caminho já testado |

## O que as referências sustentam

Três regras vieram de fora e não de opinião:

- **Dinheiro em `numeric` com escala explícita**, nunca ponto flutuante. Centavos
  em inteiro é a alternativa de performance, que aqui não se paga.
  ([Crunchy Data](https://www.crunchydata.com/blog/working-with-money-in-postgres))
- **Append-only, correção por estorno, saldo derivado.** O registro financeiro
  não é editado no lugar; qualquer saldo é obtido relendo os lançamentos.
  ([Dodo Payments](https://dodopayments.com/blogs/payment-ledger-design))
- **Idempotência determinística com índice único**, derivada do provedor mais o
  id do evento externo.
  ([Design a Payment Ledger](https://dev.to/gabrielanhaia/design-a-payment-ledger-idempotent-audit-compliant-reconciles-to-the-cent-59p7))

⚠️ **O que foi deliberadamente NÃO copiado: partidas dobradas.** As referências
de carteira digital e core banking assumem que o sistema **custodia** o dinheiro.
Nos modelos 1 e 2, ele não custodia — a imobiliária recebe na conta dela. Exigir
débito e crédito somando zero obrigaria a inventar contas contábeis que não
existem no negócio, e o painel montaria todo relatório por agregação sobre uma
abstração que ninguém opera.

O que se leva do livro-razão é o que vale **sem** custódia: append-only, estorno
em vez de edição, e idempotência.

## A. `payout_destinations` — para onde o dinheiro do proprietário vai

```
id                uuid pk
tenant_id         uuid not null  → tenants
portal_user_id    uuid not null  → portal_users
kind              text not null  ('pix' | 'conta_bancaria')

pix_key_type      text           ('cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria')
pix_key           text

bank_code         text           -- 3 dígitos (compe)
branch            text
account           text
account_digit     text
account_type      text           ('corrente' | 'poupanca')

holder_name       text not null
holder_doc        text not null
active            boolean not null default true
created_at        timestamptz not null default now()
created_by        uuid
```

`pix_key_type` existe porque guardar só a string perde a informação que o
provedor exige na hora de cobrar. São os quatro tipos do Banco Central — CPF/CNPJ,
e-mail, telefone e aleatória (EVP).

Um CHECK garante coerência: `kind = 'pix'` exige `pix_key_type` e `pix_key`;
`kind = 'conta_bancaria'` exige `bank_code`, `branch` e `account`.

## B. `contract_charges` — o que o inquilino deve

```
id              uuid pk
tenant_id       uuid not null  → tenants
contract_id     uuid not null  → contracts
kind            text not null default 'mensal'  ('mensal' | 'avulsa')
competence      date not null            -- primeiro dia do mês de referência
due_on          date not null
issued_amount   numeric(12,2)            -- o que foi EMITIDO; congelado
canceled_at     timestamptz
canceled_by     uuid
cancel_reason   text
created_at      timestamptz not null default now()
created_by      uuid
```

**Dois valores, e eles respondem perguntas diferentes.**

`issued_amount` é o que foi **emitido** — o número impresso no boleto, a quantia
que se pediu ao inquilino. Congelado: preenchido uma vez, nunca alterado. É o
retrato documental que as referências de faturamento chamam de *frozen snapshot*,
e é o que se compara contra o extrato bancário.

O total **corrente** é a soma dos itens, derivada. É o que se deve **hoje**,
depois de descontos e estornos.

A primeira versão desta spec tinha só o derivado, e estava errada: com
append-only a soma dos itens **muda** quando há correção. Ela nunca poderia
servir de retrato do que foi cobrado. `issued_amount` fica nulo enquanto a
cobrança é rascunho e é gravado na emissão.

Índice único parcial em `(contract_id, competence) where kind = 'mensal' and
canceled_at is null`: impede cobrar o mesmo mês duas vezes, sem bloquear cobrança
avulsa nem recriar depois de cancelar.

## C. `charge_items` — a discriminação do lado do inquilino

```
id                uuid pk
tenant_id         uuid not null  → tenants
charge_id         uuid not null  → contract_charges
kind              text not null
                  ('aluguel'|'condominio'|'iptu'|'seguro'|'multa'|'juros'|'desconto'|'outros')
description       text
amount            numeric(12,2) not null   -- ASSINADO
reverses_item_id  uuid           → charge_items
created_at        timestamptz not null default now()
created_by        uuid
```

`amount` positivo aumenta o que o inquilino deve; negativo reduz. Desconto e
estorno usam o mesmo mecanismo, não campos separados.

Sem `updated_at`: a linha nunca muda.

## D. `charge_settlements` — a liquidação, e a peça que compra os três modelos

```
id                       uuid pk
tenant_id                uuid not null  → tenants
charge_id                uuid not null  → contract_charges
amount                   numeric(12,2) not null   -- ASSINADO
settled_on               date not null
method                   text not null  ('boleto'|'pix'|'transferencia'|'dinheiro'|'outro')
external_ref             text           -- nosso número, e2e id do Pix, id da transação
idempotency_key          text UNIQUE    -- 'provedor:id_do_evento'
reverses_settlement_id   uuid           → charge_settlements
created_at               timestamptz not null default now()
created_by               uuid           -- nulo quando vem de webhook
```

O índice único em `idempotency_key` é global, não por tenant: a chave é
namespaced pelo provedor, e uma colisão entre tenants seria defeito que se quer
detectar, não tolerar.

`amount` assinado dá lugar a estorno e chargeback. `created_by` é nulável porque
liquidação vinda de webhook não tem usuário.

**É esta tabela que dispensa migração entre os três modelos.** No modelo 1 a
linha é gravada à mão pelo painel; no 2, pelo webhook; no 3, pelo evento de
split. A forma é a mesma.

⚠️ **`settled_on` é data fiscal, não conveniência de modelagem.** Para fins de
imposto de renda, a data de recebimento do proprietário é **a do pagamento do
locatário**, independentemente de quando o repasse saiu. Colapsar `settled_on`
em `owner_payouts.paid_at` — que era a simplificação óbvia — deixaria o modelo
fiscalmente errado, e o erro só apareceria na declaração de alguém.

## E. `owner_payouts` — o repasse ao proprietário

```
id                uuid pk
tenant_id         uuid not null  → tenants
contract_id       uuid not null  → contracts
competence        date not null
destination_id    uuid           → payout_destinations
scheduled_for     date
paid_at           timestamptz
external_ref      text
idempotency_key   text UNIQUE
canceled_at       timestamptz
canceled_by       uuid
cancel_reason     text
created_at        timestamptz not null default now()
created_by        uuid
```

`destination_id` é gravado **no repasse**, não lido do cadastro na hora de
exibir. É o que faz um extrato de seis meses atrás continuar dizendo para onde o
dinheiro de fato foi.

## F. `payout_items` — o extrato discriminado

```
id                uuid pk
tenant_id         uuid not null  → tenants
payout_id         uuid not null  → owner_payouts
kind              text not null
                  ('bruto'|'taxa_adm'|'retencao'|'abatimento'|'reembolso'|'ajuste')
description       text
amount            numeric(12,2) not null   -- ASSINADO; negativo = retido
source_charge_id  uuid           → contract_charges
reverses_item_id  uuid           → payout_items
created_at        timestamptz not null default now()
created_by        uuid
```

É o "extrato discriminado" que o mercado entrega: bruto, menos taxa de
administração, menos o reparo abatido.

⚠️ **`retencao` é genérico de propósito, e a primeira versão desta spec errava
aqui.** Ela tinha um tipo `ir_retido`, assumindo que a imobiliária retém imposto
de renda. **Ela não retém.** A imobiliária não é fonte pagadora — recebe o
aluguel como mandatária do proprietário. Quem retém é a **pessoa jurídica
locatária**, quando o inquilino é PJ e o proprietário é PF; com inquilino pessoa
física não há retenção alguma, e o proprietário recolhe por carnê-leão.

Nesse caso o IRRF já veio descontado do que o inquilino pagou — aparece como
`bruto` menor, não como retenção nossa. `retencao` fica para o que a imobiliária
de fato retém por acordo contratual, com a razão na `description`.

O que a taxa de administração é, fiscalmente: **dedutível do bruto antes do
cálculo do imposto** do proprietário. Por isso ela precisa aparecer discriminada
no extrato — é insumo da declaração dele, não só transparência.

`source_charge_id` liga o item bruto à cobrança que o originou — é o que permite
a linha dizer *"referente ao aluguel de setembro"* em vez de um número solto.

## G. Integridade de tenant nas tabelas filhas

`tenant_id` repetido nas tabelas de item resolve a policy, mas abre um buraco: nada
impediria uma linha com `tenant_id` do tenant A apontando para um pai do tenant B.
A invariante #1 do repositório cairia **dentro da tabela escrita para respeitá-la**.

O fecho é FK composta. Cada pai ganha um índice único redundante em `(id, tenant_id)`,
e cada filha referencia o par:

```sql
-- nos pais
unique (id, tenant_id)

-- nas filhas
foreign key (charge_id,   tenant_id) references contract_charges (id, tenant_id)
foreign key (payout_id,   tenant_id) references owner_payouts    (id, tenant_id)
```

Vale para `charge_items`, `charge_settlements` e `payout_items`. O mesmo para
`payout_destinations.portal_user_id` contra `portal_users (id, tenant_id)`, e para
`owner_payouts.destination_id` contra `payout_destinations (id, tenant_id)`.

Custa um índice por pai e torna a violação **impossível**, não apenas improvável.
É o padrão recomendado para multitenancy em Postgres, e a formulação das
referências é a mesma: torna a referência cruzada *estruturalmente impossível*,
em vez de meramente improvável.

**E os índices de consulta começam por `tenant_id`.** O `unique (id, tenant_id)`
acima existe para a FK; ele **não** serve às leituras. A RLS acrescenta o
predicado de tenant a toda consulta, então o índice precisa casar com ele:

```sql
create index on contract_charges (tenant_id, contract_id, competence);
create index on charge_items      (tenant_id, charge_id);
create index on charge_settlements(tenant_id, charge_id);
create index on owner_payouts     (tenant_id, contract_id, competence);
create index on payout_items      (tenant_id, payout_id);
create index on payout_destinations (tenant_id, portal_user_id);
```

⚠️ **Checagem de integridade referencial ignora RLS.** Unique, PK e FK são
verificados fora da política — é assim por desenho, para a integridade não depender
de quem consulta. A consequência prática: a mensagem de erro de uma violação pode
revelar que existe linha em outro tenant. Não é leitura de dado, mas é sinal, e
o tratamento de erro dos endpoints não deve repassar a mensagem crua do banco —
que já é a regra da casa (`friendly-error.ts`).

## H. RLS e grants — onde este repositório já sangrou

Todas as seis:

- `enable row level security`;
- **`revoke all ... from anon`** — a policy sozinha não basta, porque o Supabase
  dá GRANT default ao `anon`. É a regra escrita no `CLAUDE.md`, e a razão de
  existirem as migrations 0005, 0011 e 0015;
- policy de membro por `is_tenant_member(tenant_id)`, que já existe;
- **nenhuma policy para o papel do portal na v1.**

⚠️ `payout_destinations` guarda dado bancário de pessoa real, no mesmo banco que
serve quatro imobiliárias. É a invariante #3 do repositório — "leitura pública
não devolve coluna interna" — aplicada a uma tabela que nasce **inteira** como
coluna interna. O `revoke` não é formalidade.

## Fora do escopo, por decisão

- **Comissão de corretor.** `brokers` é cadastro, não usuário: não tem `user_id`
  e não faz login. Modelar comissão exige esse vínculo primeiro, e isso é decisão
  de produto, não de schema.
- **Fiscal — NFS-e e DIMOB.** Dependem de integração externa que define o
  formato. Reservar colunas agora seria adivinhar.
- **Split via conta digital.** O modelo acomoda (a liquidação já tem forma e
  idempotência), mas as contas do arranjo de pagamento são desenho próprio.
- **Qualquer lógica, endpoint ou tela.** Esta spec entrega tabelas vazias.
- **Leitura pelo portal.** O extrato continua chegando como PDF por
  `portal_documents`, pelo caminho já coberto por teste E2E.

## Riscos aceitos

**Totais derivados por agregação.** Toda listagem soma itens. Com dezenas de
linhas por mês é irrelevante; se um dia pesar, materializar é `add column` mais
trigger — não migração de dado.

**Append-only infla a contagem.** Uma cobrança corrigida três vezes tem sete
linhas. É o preço da trilha, e foi escolha consciente.

**Seis tabelas sem consumidor.** Schema sem código é schema não exercitado: a
primeira implementação vai encontrar detalhes que o desenho não previu. A aposta
é que corrigir schema vazio custa menos que migrar schema com histórico — que é
exatamente o argumento da análise de mercado que motivou isto.

**O modelo assume locação.** Venda tem comissão, parcela e distrato, que não se
encaixam em cobrança mensal com competência. Se venda entrar, é desenho à parte,
não extensão deste.

## Pendente fora do código

Nada. As tabelas nascem vazias e nenhuma configuração manual é necessária.
