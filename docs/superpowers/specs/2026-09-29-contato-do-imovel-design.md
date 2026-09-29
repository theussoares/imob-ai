# Contato na página do imóvel, por imobiliária

## Motivo

Um cliente pediu para mostrar quem captou o imóvel na página de detalhe, sem o
celular do corretor, e com o WhatsApp indo só para o número da imobiliária.
Até aqui a regra era uma para todos: WhatsApp no captador ativo com telefone,
nome nunca à mostra. Outros clientes querem outras combinações — esconder o
captador, mostrar e mandar para ele, ou só mandar para ele.

## Escopo

Duas opções por imobiliária, em `tenants` (migration 0059), editadas no painel
em **Corretores › Contato na página do imóvel**:

| Opção | Coluna | Valores | Default |
|---|---|---|---|
| Mostrar quem captou | `listing_broker_visible` | sim / não | não |
| Destino do WhatsApp | `whatsapp_target` | `captador` / `imobiliaria` | `captador` |

Os defaults são o comportamento de produção antes da mudança: aplicar a
migration não altera o site de ninguém.

| | WhatsApp no captador | WhatsApp na imobiliária |
|---|---|---|
| **Mostra o captador** | nome + CRECI + foto; conversa com ele | nome + CRECI + foto; conversa com a imobiliária (o pedido do cliente) |
| **Esconde o captador** | como era antes | nada do corretor sai do servidor |

A regra vale nos três lugares que conhecem o captador, em
`server/repositories/property.repository.ts`: detalhe, cards do catálogo e o
registro do clique no WhatsApp (que alimenta a métrica "foi para o corretor").
Corretor inativo continua sem aparecer e sem receber, em qualquer combinação.

O botão "Ligar para o corretor" virou "Ligar para a imobiliária": ele sempre
discou o telefone da imobiliária, e com o captador nomeado logo acima o rótulo
antigo fazia esperar falar com ele.

## Fora do escopo, por decisão

- **Escolha por imóvel.** É política comercial da casa. Um seletor em cada
  cadastro viraria mistura que ninguém consegue explicar ao visitante.
- **Captador no card do catálogo.** O pedido é a página de detalhe; o card já
  está no limite do que cabe.
- **Consentimento do corretor.** Quem decide publicar o nome é a imobiliária,
  como já decide o cadastro. `public_visible` continua valendo só para a
  página "Quem somos" — é outra vitrine, com bio e foto grande.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Duas colunas independentes | Um enum com as quatro combinações | São dois eixos (o que se vê × para onde vai). O enum obriga a tela a explicar o produto cartesiano e a próxima opção dobra os valores. |
| O servidor aplica a regra e só manda o resultado | Mandar a configuração e deixar o navegador decidir | Com o WhatsApp na imobiliária, o celular do corretor ficaria no JSON da página — o que o cliente pediu para não mostrar. |
| Colunas fora do grant do anon (0047) | Incluir em `TENANT_PUBLIC_COLUMNS` | Consequência da linha acima; e evita a ordem de deploy delicada da 0047 (grant antes do código). |
| A configuração é lida dentro do repository, em paralelo com a query do imóvel | Cada endpoint ler e passar como parâmetro | São três leituras públicas; esquecer de passar num lugar dá dois destinos para o mesmo imóvel. Em paralelo, não soma round-trip, e o cache de 60s do endpoint absorve o resto. |
| Captador visível = nome, foto e CRECI | Reusar `PublicBroker` inteiro | `id` não serve ao visitante e `bio` foi escrita para "Quem somos". |
| Leitura sem linha cai no default | Falhar a página | O site continua como sempre foi, em vez de inventar uma terceira regra para o erro. |
