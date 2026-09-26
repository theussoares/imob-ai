# Cobrança de aluguel pelo Cora

**Data:** 2026-09-23
**Motivo:** o cliente avisou que vai contratar o Banco Cora para emitir boleto.
É o gatilho que a [spec dos módulos financeiros](2026-09-01-modulos-financeiros-design.md)
esperava para o item 3 — "o primeiro cliente de locação pesada pedindo
cobrança". Não fomos nós que escolhemos o provedor: o candidato de lá era o
Asaas, e o cliente decidiu pelo Cora. O desenho de adaptador existe exatamente
para isso não custar o produto.

As seis tabelas do [modelo financeiro](2026-09-21-modelo-financeiro-design.md)
já existem e estão vazias (0041 e 0042 aplicadas em produção, conferido em 24/09). Esta
spec é a primeira coisa que escreve nelas.

## O que o Cora é, e o que ele não é

Conferido na documentação oficial em 23/09/2026
([developers.cora.com.br](https://developers.cora.com.br/llms.txt)), não de
memória — a spec financeira já registrou três erros de enumeração por inferência,
e dinheiro não é lugar para o quarto.

**Duas modalidades de integração, e a escolha decide a arquitetura:**

| | Integração Direta | Parceria Cora |
|---|---|---|
| para quem | "empresas que têm software próprio de gestão" integrando a **própria** conta | ERPs, CRMs, BPOs — plataforma que serve **vários** clientes finais |
| autenticação | `client_credentials` + **certificado e chave privada (mTLS)** por conta, token de 24h sem refresh | OAuth `authorization_code`: o cliente final consente com escopos (`invoice`, `transfer`…) |
| credencial que a gente guarda | certificado + chave privada **de cada imobiliária** | um `client_secret` da plataforma + tokens por cliente |
| webhook | um endpoint por conta, criado com o token dela | um endpoint da aplicação recebe o evento de todos os clientes |
| depende de | a imobiliária gerar as credenciais no app | acordo comercial de parceria com o Cora (prazo e requisitos: **não documentados**) |

**O que a API faz e interessa aqui:**

- boleto registrado com QR Code Pix no mesmo documento (`POST /v2/invoices`);
  pagar pelo Pix cancela o código de barras sozinho, sem duplicidade;
- multa (valor ou percentual), juros e desconto configurados **no boleto**;
- lembrete de cobrança por e-mail (SMS só no plano Cora Pro);
- cancelamento de boleto não pago (`204`; `422 REC-0006` se já foi pago);
- `Idempotency-Key` (UUID) nas criações;
- webhook de `invoice.paid`, `invoice.overdue`, `invoice.canceled`;
- transferência por API — **que fica `INITIATED` até alguém aprovar no app**;
- NFS-e própria (fora do escopo, mas relevante para o item 4 da spec de módulos).

**Restrições que moldam o desenho:**

- valores em **centavos inteiros**; o banco guarda `numeric(12,2)`;
- boleto mínimo de **R$ 5,00**;
- vencimento **não pode ser anterior** à data de emissão;
- `description` de cada serviço: **100 caracteres**; nome do pagador: **60**;
- **o webhook não tem corpo nem assinatura.** Chega só com cabeçalhos:
  `webhook-event-id`, `webhook-event-type`, `webhook-resource-id`.

## Escopo (v1)

A imobiliária conecta a conta Cora dela, emite pelo painel o boleto de um
contrato para uma competência, o inquilino recebe no e-mail e na Área do
Cliente, e o pagamento se reconcilia sozinho.

1. **Conectar a conta** — tela em `/admin` que recebe o `client_id` e o par
   certificado/chave, testa o token e cria o webhook.
2. **Emitir a cobrança** — por contrato e competência, com a discriminação
   (aluguel, condomínio, IPTU…) e multa/juros do contrato.
3. **Publicar no portal** — o PDF do boleto vira um `portal_documents` de
   categoria `boleto`, pelo caminho que já tem teste E2E.
4. **Reconciliar** — webhook → confirmação na API do Cora → `charge_settlements`.
5. **Cancelar** — cancela no Cora primeiro, marca `canceled_at` depois.
6. **Painel de cobranças** — lista por competência, com filtro de atrasadas.

## Fora do escopo, por decisão

- **Repasse ao proprietário.** Vira fase própria (ver "Depois da v1"). A API de
  transferência do Cora exige aprovação manual no app — não existe repasse
  automático a oferecer, e fingir que existe na tela seria pior que não ter.
- **Geração automática mensal.** A v1 emite por botão. O job entra quando a
  emissão manual tiver rodado um ciclo inteiro sem surpresa: automatizar um
  fluxo que ninguém viu funcionar é multiplicar o erro por contrato.
- **Parceria Cora.** Ver decisões. O adaptador fica pronto para ela; o acordo
  comercial não é nosso para fechar hoje.
- **NFS-e pelo Cora**, **carnê**, **SMS**, **reajuste por índice** (IGPM/IPCA)
  e **cobrança de condomínio** como produto.
- **Outro provedor.** A interface é genérica; só o Cora é implementado.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| v1 em **Integração Direta** | esperar a Parceria Cora | o cliente está pronto agora; a parceria depende de acordo sem prazo publicado. O custo é guardar chave privada por tenant — tratado abaixo como o risco principal desta spec |
| adaptador `server/services/payments/` com interface nossa, Cora como uma implementação | chamar a API do Cora direto do endpoint | é o princípio da spec de módulos; e a troca para Parceria muda autenticação e webhook, não o domínio |
| **o webhook só dispara; a verdade vem de `GET /v2/invoices/{id}`** | confiar no cabeçalho `invoice.paid` | o webhook não tem assinatura nem corpo: qualquer um que descubra a URL manda um `invoice.paid`. Reconsultar com a credencial do tenant torna o evento forjado inofensivo — no máximo custa uma chamada |
| URL do webhook com segredo opaco por integração (`/api/webhooks/cora/<token>`) | uma URL única, tenant pelo `Host` ou pelo `resource-id` | o `Host` do webhook é o da plataforma, não o do tenant; e achar o tenant pelo `resource-id` exigiria busca cruzada entre tenants antes de saber em nome de quem se está agindo. O token aponta a integração, e a integração define o tenant. Não é autenticação — é roteamento e redução de ruído; a segurança está na reconsulta |
| `idempotency_key = 'cora:' \|\| webhook-event-id` em `charge_settlements` | chave pelo `payment.id` do Cora | o evento é o que se reentrega. Único **por tenant**, como a 0042 já corrigiu |
| certificado e chave **cifrados na aplicação** (AES-256-GCM, chave mestra em `NUXT_INTEGRATIONS_KEY`) | Supabase Vault; texto puro em coluna privada | com Vault, quem tem a service_role decifra tudo pelo próprio banco. Cifrando fora, vazar o banco não basta — precisa vazar o banco **e** o ambiente da Vercel. Texto puro nem entra na conversa: é chave que emite cobrança em nome da imobiliária |
| nova tabela `charge_provider_invoices` | colunas de provedor em `contract_charges` | o cabeçalho da cobrança é do domínio e foi desenhado sem provedor. Uma cobrança cancelada e reemitida tem **dois** boletos; em coluna, o primeiro some |
| multa e juros configurados **no boleto**; o valor pago a mais vira `charge_items` (`multa`, `juros`) na liquidação | calcular multa/juros no nosso lado e reemitir | o boleto vencido é pago no banco com o acréscimo que o próprio Cora calcula; reemitir seria outro boleto. Gravar o acréscimo como item mantém `issued_amount` congelado e o total corrente batendo com o que entrou |
| PDF copiado para o Storage e publicado como `portal_documents` | link direto para a URL do Cora | reaproveita o download protegido, a trilha de acesso e o E2E da Área do Cliente. E o portal continua sem ler as tabelas financeiras, como a spec do modelo decidiu |
| valores convertidos em centavos **só no adaptador** | mudar o banco para inteiro | o repo inteiro está em `numeric(12,2)`, e a spec do modelo já pesou isso. A conversão é um ponto só, testado com os casos de arredondamento |
| emissão exige CPF/CNPJ do inquilino | emitir sem documento | o Cora recusa. `portal_users.doc` é nulável; a tela avisa antes, em vez de o erro vir do provedor |
| cobrar o **inquilino principal** do contrato | um boleto por parte | o boleto tem um pagador. Contrato com mais de um inquilino exige escolher quem é o pagador — decisão explícita na emissão, não inferida |
| módulo atrás de entitlement por tenant | liberar para todos | é add-on pago pela spec de módulos; o padrão já existe em `server/utils/entitlement.ts` (0.6) |

## Modelo de dados (migration nova)

### `tenant_integrations`

```
id                   uuid pk
tenant_id            uuid not null → tenants
provider             text not null  ('cora')
mode                 text not null  ('direta' | 'parceria')
environment          text not null  ('stage' | 'producao')
client_id            text not null
secret_ciphertext    bytea not null   -- certificado + chave, cifrados (AES-256-GCM)
secret_iv            bytea not null
key_version          smallint not null default 1
webhook_token        text not null unique   -- o <token> da URL; aleatório, 32 bytes
provider_webhook_id  text              -- id do endpoint criado no Cora
status               text not null  ('pendente' | 'ativa' | 'erro' | 'desconectada')
last_error           text
connected_at         timestamptz
connected_by         uuid
created_at / updated_at
unique (tenant_id, provider, environment)
```

`key_version` existe para rotacionar a chave mestra sem janela de falha:
decifra com a versão gravada, recifra com a nova.

⚠️ **Tabela inteira de dado interno.** `enable row level security`, `revoke all
from anon` **e** `from authenticated`. Nenhuma policy: só a service_role no
servidor lê. O painel vê o status por endpoint, que nunca devolve
`secret_*` nem `webhook_token` — e o guardrail de payload ganha estas colunas.

### `charge_provider_invoices`

```
id                 uuid pk
tenant_id          uuid not null
charge_id          uuid not null     → contract_charges (id, tenant_id)
integration_id     uuid not null     → tenant_integrations
provider_id        text not null     -- inv_… do Cora
status             text not null     ('aberto' | 'pago' | 'atrasado' | 'cancelado')
amount_cents       bigint not null   -- o que foi pedido ao Cora, na unidade dele
digitable_line     text
pix_emv            text
pdf_document_id    uuid              → portal_documents
idempotency_key    uuid not null     -- enviado no Idempotency-Key da criação
created_at / updated_at
unique (tenant_id, provider_id)
unique (tenant_id, idempotency_key)
```

FK composta com `tenant_id`, como a seção G do modelo financeiro. RLS de membro
por `is_tenant_member(tenant_id)`, `revoke all from anon`.

`amount_cents` em inteiro é a exceção consciente ao `numeric` do repo: é o valor
**na unidade do provedor**, guardado para comparar byte a byte com a resposta
dele. O domínio continua lendo `issued_amount`.

## Fluxos

### Conectar

1. Admin cola o `client_id` e sobe o `.zip` que o app do Cora gera (certificado
   + chave). O servidor valida que o par casa antes de gravar.
2. Cifra, grava com `status = 'pendente'`.
3. Pede token (`POST /token` com mTLS). Falhou → `erro`, com a mensagem do
   Cora em `last_error` (sem ecoar nada da credencial).
4. Cria o endpoint de webhook `invoice.*` apontando para
   `/api/webhooks/cora/<webhook_token>`. Grava `provider_webhook_id`, `ativa`.

Stage primeiro, sempre. A tela mostra o ambiente em destaque — emitir boleto de
teste em produção é boleto de verdade no CPF de alguém.

### Emitir

1. `requireTenantMember` → tenant. Contrato e competência vêm do body; **o
   contrato é relido com `tenant_id` no where** antes de qualquer coisa.
2. Monta os `charge_items` e o total. Valida: ≥ R$ 5,00, vencimento ≥ hoje,
   pagador com CPF/CNPJ, descrições ≤ 100.
3. Grava `contract_charges` + itens + `charge_provider_invoices` com um
   `idempotency_key` novo — **antes** de chamar o Cora.
4. Chama `POST /v2/invoices` com esse `Idempotency-Key` e `code = charge_id`.
5. Sucesso → grava `provider_id`, linha digitável, Pix, `issued_amount`; baixa o
   PDF, sobe no Storage, cria o `portal_documents` e publica.

Por que gravar antes de chamar: se a resposta se perde (timeout na Vercel), a
linha local tem a chave para reenviar **a mesma** requisição, e o Cora devolve o
mesmo boleto em vez de criar outro. Sem isso, o retry do usuário emite dois
boletos para o mesmo aluguel.

### Reconciliar

1. `POST /api/webhooks/cora/<token>` → acha a integração pelo token (404 se não
   existe, sem distinguir de rota inexistente). Responde `200` rápido.
2. Lê `webhook-resource-id`; busca `charge_provider_invoices` **com o
   `tenant_id` da integração** no where. Não achou → registra e ignora.
3. **Reconsulta** `GET /v2/invoices/{id}` com a credencial do tenant.
4. Se `PAID`: para cada `payments[]`, grava `charge_settlements` com
   `idempotency_key = 'cora:<event-id>:<payment.id>'`, `method` (`BANK_SLIP` →
   `boleto`, `PIX` → `pix`) e `settled_on` = data em que o inquilino pagou.
   Multa e juros pagos viram `charge_items` antes do settlement.
5. `23505` na chave → já processado, `200`.

A mesma rotina roda sob demanda ("verificar agora" na tela) e, na v2, num
varredor diário — webhook que se perde não pode deixar aluguel pago aparecendo
como devido.

## Invariantes (cada uma vira teste)

Somam-se às oito da spec de módulos, que continuam valendo.

1. **Estado de pagamento só muda depois da reconsulta à API.** O teste manda um
   webhook `invoice.paid` para um boleto que a API (fake) diz estar `OPEN`, e
   nada é gravado.
2. **O webhook nunca age fora do tenant da integração.** Token do tenant A com
   `resource-id` de boleto do tenant B → ignorado.
3. **`secret_*` e `webhook_token` nunca saem num payload.** Entram no
   `public-payload-guardrail` e no teste de endpoints do painel.
4. **Uma emissão, um boleto.** Duas chamadas com a mesma cobrança reusam o
   `Idempotency-Key` gravado.
5. **Centavos convertidos num ponto só**, com teste de `0,1 + 0,2`,
   `1.234,56` e o mínimo de R$ 5,00.
6. **Cancelar não marca local se o Cora recusou.** `REC-0006` (já pago) aborta e
   dispara a reconciliação, porque significa que perdemos um webhook.
7. **Mensagem do Cora não chega crua ao painel**: o endpoint devolve erro nosso,
   e o `app/utils/friendly-error.ts` traduz. A mensagem do provedor pode citar
   dado do pagador, e vai só para o log.

## Depois da v1

**Repasse, no modelo "o sistema prepara, a imobiliária aprova".** O Cora deixa
iniciar a transferência por API, mas ela fica parada até aprovação no app. Isso
dá um meio-termo honesto entre os modelos 1 e 3 da spec do modelo financeiro: o
sistema calcula o extrato (`payout_items`), inicia a transferência e o dono da
conta aprova no celular. O webhook `transfer.*` fecha o `paid_at`.

Dois limites já visíveis: a API pede `bank_code` (COMPE), então destino
cadastrado só com ISPB não passa por ela; e não achei Pix por chave nesse
endpoint — **conferir antes de desenhar**.

**Geração mensal automática**, **varredor de reconciliação**, e a **Parceria
Cora** quando houver o segundo cliente no Cora.

## Riscos aceitos

**Chave privada por tenant.** É o preço da Integração Direta, e o maior risco
desta spec: quem tem o par emite e cancela boleto na conta da imobiliária.
Mitigado pela cifra fora do banco, pela ausência de policy e pelo escopo — a
v1 não chama nenhuma API que tire dinheiro da conta. Não é eliminado.

**Token em memória por instância.** A Vercel não compartilha memória entre
funções: cada instância fria pede um token novo. Custa uma chamada mTLS; se o
Cora tiver limite de emissão de token (não documentado), vira cache em tabela.

**URL de webhook adivinhável por quem tem acesso ao painel do Cora.** Por isso a
reconsulta — a URL é só roteamento.

## Pendente fora do código

- **Com o cliente:** confirmar que o repasse manual na v1 é aceitável; quantos
  contratos e boletos por mês; se contrato com mais de um inquilino existe na
  carteira; política de multa/juros padrão.
- **Com o cliente, no app do Cora:** gerar `client_id` e certificado **de stage**
  primeiro; cadastrar chave Pix na conta (sem ela o boleto sai sem QR Code).
- **Com o Cora (suporte):** período da taxa de `interest` (a doc não diz se é ao
  mês); política de reentrega do webhook; limites de requisição; tarifa por
  boleto no plano do cliente; se Integração Direta pode ser operada por software
  de terceiro em nome do cliente; requisitos e prazo da Parceria.
- **Com a gente:** criar `NUXT_INTEGRATIONS_KEY` na Vercel.
