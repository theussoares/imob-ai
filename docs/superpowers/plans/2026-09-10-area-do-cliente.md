# Área do Cliente — escopo, riscos e prazo

**Data:** 2026-09-10
**Motivo:** uma cliente viu a "Área do Cliente" de uma plataforma concorrente e
pediu o equivalente: inquilino e proprietário logando para acessar boletos,
contratos e vistorias. Entra como prioridade 0, saindo direto de `main`.

**Decisões travadas com o Matheus antes de estimar:**

- **Origem dos dados: upload manual pelo painel.** A imobiliária sobe os PDFs;
  não há integração com ERP nesta entrega. Isso tira do prazo a maior fonte de
  risco (depender da API de terceiro) e coloca no lugar um custo operacional
  recorrente — ver "O que ninguém vê no print", abaixo.
- **Escopo: completo.** Inquilino e proprietário, com boleto, 2ª via, contrato,
  vistoria e extrato de repasse.

## O ponto de partida honesto

O imob-ai **não tem nada de locação**. Uma busca por contrato, boleto, vistoria e
inquilino no repositório inteiro devolve três resultados, todos coincidência de
palavra em comentário. Não existe contrato, não existe documento, não existe
cliente-pessoa: `aluguel` hoje é só um valor da coluna `purpose` de um imóvel de
catálogo.

Ou seja: isto não é uma tela nova. É um **segundo produto autenticado** dentro do
mesmo app — outro tipo de usuário, outro domínio de dados, outro nível de sigilo.

## A decisão central: o cliente não é membro

Hoje o único usuário autenticado é a imobiliária, e `is_tenant_member()` libera
**20 policies** — imóveis com nome e telefone do proprietário, corretores, leads,
configurações do site.

Dar ao inquilino uma linha em `tenant_members`, ainda que com um papel novo,
entregaria a base inteira da imobiliária para o cliente dela. Por isso:
`portal_users` é tabela própria, com predicado próprio (`is_portal_user`), e não
há caminho de um para o outro. As duas portas de entrada no servidor
(`requireTenantMember` e `requirePortalUser`) são simétricas e mutuamente
exclusivas.

## Modelo de dados

```
portal_users            o cliente (inquilino / proprietário / fiador)
contracts               o contrato de locação
contract_parties        quem está em qual contrato, em que papel
portal_documents        o arquivo publicado, com público-alvo e data de publicação
portal_document_access  trilha de download (LGPD)
```

Duas escolhas que valem registro:

- **O papel fica na relação, não na pessoa.** Quem aluga um imóvel e é dono de
  outro é inquilino num contrato e proprietário no outro, com a mesma conta. Se o
  papel fosse atributo do usuário, esse caso viraria duas contas e dois e-mails.
- **`contracts.source` e `contracts.external_id` já nascem na tabela**, mesmo com
  a entrega sendo 100% manual. Quando a integração com ERP entrar, o mesmo
  contrato passa a chegar com `source='erp'` sem migrar tabela nem reescrever a
  área do cliente. Duas colunas hoje custam nada e evitam o retrabalho inteiro.

## A regra de acesso, e por que ela está em dois lugares

"Este cliente pode ver este documento?" = **publicado** + **do contrato dele** +
**endereçado ao papel dele naquele contrato**.

A regra existe como policy de RLS (migration 0028) e como função pura em
`shared/utils/portal-access.ts`. A duplicação é deliberada: o download é assinado
pela *service role*, que **ignora RLS** — porque o cliente não tem policy de
leitura no bucket privado. Nesse caminho, a função em TypeScript é a única
barreira entre o inquilino e o extrato de repasse do proprietário. Por isso ela é
pura e coberta por teste.

O default de público-alvo por categoria também é código, não caixinha no
formulário: boleto e recibo nascem só do inquilino, extrato só do proprietário.
O vazamento clássico desta feature é o proprietário vendo os dados de pagamento
de quem mora no imóvel — e ele acontece quando alguém esquece de marcar o campo
às 18h de uma sexta.

## Achado de segurança encontrado no caminho (não corrigido ainda)

**As colunas internas de `properties` estão protegidas apenas contra o papel
`anon`.**

A migration 0011 faz `revoke select on public.properties from anon` e devolve
o `grant` só nas colunas públicas — deixando `owner_name`, `owner_phone`,
`location` e `broker_id` de fora. Mas o `revoke` nunca foi aplicado ao papel
`authenticated`, que mantém o `grant` default do Supabase sobre a tabela inteira.

Hoje isso não vaza nada: todo usuário autenticado é membro da imobiliária e
deveria mesmo ver esses campos. **No dia em que dermos login para inquilinos e
proprietários, cada cliente com senha passa a conseguir ler nome e telefone do
proprietário de todo imóvel ativo** — de todos os tenants — usando a anon key,
que vai no HTML de toda página, mais o próprio token.

A policy `properties_public_read` não protege: RLS filtra linha, não coluna.

Correção (entra na Fase 0, é pré-requisito de segurança para o portal existir):
`revoke select on properties from authenticated` + `grant` das colunas públicas,
e os dois endpoints de leitura do painel (`/api/admin/properties`) passam a ler
pela service role com filtro de tenant explícito — o padrão que
`member.repository.ts` já usa.

## O que ninguém vê no print

O print do concorrente diz: *"Todos os proprietários recebem mensalmente um
e-mail com seus dados de acesso."* Duas consequências que precisam estar no
prazo:

1. **SMTP próprio é dependência, não detalhe.** O SMTP embutido do Supabase
   limita a poucos envios por hora e sai do domínio dele, caindo em spam — foi
   exatamente por isso que o convite de usuários do painel entrega link copiável
   em vez de e-mail. Para um disparo mensal a uma carteira inteira, isso não
   serve: precisa de Resend ou SES com domínio verificado.
2. **Upload manual é trabalho recorrente da imobiliária.** Com a carteira dela,
   é uma pessoa subindo um boleto por contrato, todo mês, para sempre. A feature
   não morre de bug — morre de fadiga operacional no terceiro mês. Por isso a
   Fase 1 inclui envio em lote, e por isso a integração com ERP é a sequência
   natural (e o schema já está preparado para ela).

## Fases e prazo

Estimativa em dias úteis de trabalho efetivo.

| Fase | Entrega | Dias |
|---|---|---|
| 0 | Fundação e blindagem | 4–5 |
| 1 | Painel: contratos, clientes e documentos | 5–6 |
| 2 | Área do cliente (front) | 4–5 |
| 3 | Endurecimento, LGPD e produção | 3–4 |
| | **Total** | **16–20** |

**Fase 0 — Fundação e blindagem (4–5 dias)**
- [x] Migration 0028: schema, RLS, bucket privado, trilha de download
- [x] Modelos de domínio + regra de acesso pura + 11 testes
- [x] `requirePortalUser` (a porta do cliente, espelho da porta do painel)
- [ ] Fechar a brecha de colunas de `properties` para `authenticated` — 1 dia
- [ ] Mappers e repositories das 5 tabelas novas — 1 dia
- [ ] SMTP próprio (Resend/SES) + template de convite — 1 dia
- [ ] Auth do portal no client: `storageKey` separado do painel, middleware,
      login e definir-senha — 1,5 dia

**Fase 1 — Painel (5–6 dias)**
- CRUD de contrato, vínculo com imóvel e com as partes — 2 dias
- Convidar cliente, listar, reenviar, desativar — 1,5 dia
- Upload de documento: categoria, competência, público-alvo, publicar — 2 dias
- Envio em lote dos boletos do mês — 1 dia

**Fase 2 — Área do cliente (4–5 dias)**
- Login e recuperação de senha — 0,5 dia
- "Meus contratos" e detalhe do contrato — 1,5 dia
- Documentos por categoria, download assinado, 2ª via, trilha — 1,5 dia
- Mobile de verdade e estados vazios/erro — 1 dia
- Entrada no site (header/rodapé) — 0,5 dia

**Fase 3 — Endurecimento, LGPD e produção (3–4 dias)**
- Rate limit no download, expiração curta da URL assinada, teste de que o
  cliente A não alcança o documento do cliente B — 1,5 dia
- `/security-review` e correções — 1 dia
- Política de privacidade e retenção atualizadas — 0,5 dia
- Deploy, primeiro contrato real cadastrado junto com a imobiliária — 1 dia

### Prazo a passar para a cliente

**5 semanas**, com dois marcos visíveis antes do fim:

- **Semana 2** — ela entra num link de teste, com um contrato real dela
  cadastrado, e baixa o contrato e a vistoria pelo celular.
- **Semana 4** — boletos, 2ª via e extrato no ar em produção, para os primeiros
  contratos.
- **Semana 5** — endurecimento, LGPD e abertura para a carteira.

**A condição que sustenta o prazo:** a imobiliária precisa entregar, ainda na
semana 1, **um contrato real com os PDFs correspondentes** (contrato assinado,
uma vistoria, um boleto, um extrato). Sem um caso real para modelar, a estimativa
escorrega — é o material que define nomenclatura, o que é sigiloso e o que a
pessoa espera encontrar na tela.

## Fora do escopo, por decisão

- **Integração com ERP.** Fica para a fase seguinte; o schema já está preparado
  (`source`, `external_id`). Vira prioridade quando o volume de upload manual
  incomodar — e vai incomodar.
- **Pagamento dentro do portal.** Emitir ou registrar boleto é operação
  financeira regulada, com outro nível de responsabilidade. Aqui a 2ª via é o
  arquivo que a imobiliária publicou.
- **Chat / chamado dentro da área do cliente.** O canal dela é o WhatsApp, que já
  está no site.
- **Inquilino vendo os dados do proprietário (e vice-versa).** As policies
  deliberadamente não expõem as outras partes do contrato. Se for pedido, é
  decisão de produto — não pode entrar por efeito colateral de policy.
