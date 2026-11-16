# Painel de gestão — Locação e próximas telas

Continuação de `2026-11-15-painel-gestao-design.md`. Contrato de venda aprovado pela Olmi em 16/11.
Fonte das regras: ClickUp, épico «Contratos de locação: fluxo de 8 etapas» (OLMI Imóveis — Sistema de gestão).

## Motivo

Venda está pronta e aprovada; o menu ainda mostra Locação, Dashboard, Financeiro, Consulta, Auditoria e
Configurações como «em breve». Locação é o próximo contrato do cliente.

## Ordem (Imóveis fica para o final, decisão de 16/11)

1. **Locação** (este documento).
2. Financeiro (cobranças e repasses nascem na etapa 7 da locação).
3. Dashboard.
4. Consulta cadastral (placeholder) e Auditoria.
5. Configurações.
6. Imóveis: reaproveitar o CRUD real do `/admin` (fica nos dois lugares).

## Escopo da Locação

Mesmo padrão das vendas: domínio puro em `layers/gestao/domain`, store local (localStorage), mocks de seed,
permissões existentes. Sem backend nesta fatia.

| Etapa | Conteúdo |
|---|---|
| 1 Abertura | Locador, locatário, imóvel (escolhido de uma lista de imóveis de exemplo; vira cadastro real no item 6), corretor |
| 2 Documentos do locatário | Checklist com arquivo, estado derivado do arquivo (`requisito`), como na venda |
| 3 Documentos do locador | idem |
| 4 Documentos do imóvel | idem |
| 5 Garantia | Tipo: caução, seguro-fiança, fiador, título de capitalização, outra; anexo obrigatório |
| 6 Vistoria | Entrada e saída, com fotos (nome do arquivo no mock) |
| 7 Contrato e financeiro | Valor, dia de vencimento, datas, reajuste, taxa da imobiliária; cobrança mensal; pagamento com comprovante gera repasse pendente; registrar repasse. **Só com permissão `valores`** |
| 8 Acompanhamento | Renovar por 12 meses, encerrar, arquivar (`arquivar`) |

Menu «Locação» deixa de ser «em breve»: lista (cards, busca, filtro de status), «Nova locação», tela do
processo com stepper. Corretor só vê as suas (`verTodos`).

## Fora do escopo por decisão

- Alertas 30/60/90 de fim de contrato (item próprio depois).
- Cobrança real (Asaas) e repasse real: aqui só o registro.
- Persistência real/Supabase (igual à venda).
- Imóveis (item 6).

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Tipo `Locacao` separado de `Processo` (venda), reaproveitando `Documento`, `Pessoa`, permissões, stepper e requisitos | Generalizar `Processo` com `tipo` | `Processo` está acoplado a comissão e fontes de pagamento; misturar quebra o que o cliente já aprovou |
| Imóvel de exemplo por lista fixa no seed | Digitar texto livre | A etapa 1 já nasce com «imóvel do cadastro»; trocar pela API real depois não muda a tela |
| Valores da etapa 7 escondidos sem `valores` (aba some) | Aba com cadeado | Mesmo critério da aba Comissão da venda |
| Status e etapas próprios da locação em `domain/` | Reusar os 13 status da venda | Fluxo diferente (garantia, vistoria, repasses) |

## Aberto para o implementador

Lista exata de status da locação e de documentos por etapa: derivar dos nomes das etapas e do checklist
da venda; sinalizar na entrega o que foi assumido.
