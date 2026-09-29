# Feed dos portais (ZAP, Viva Real, OLX) que o Canal Pro aceita

## Motivo

A landing, o roteiro de vendas e o painel vendem "integração com portais". O
cliente colava o link de Configurações no Canal Pro e nenhum imóvel subia. Dois
defeitos, os dois silenciosos para nós:

1. **Todo anúncio era recusado.** O VRSync exige `PostalCode` (e `Address`) em
   toda `Location`. O feed nunca mandou nenhum dos dois — o imóvel nem tinha
   onde guardar CEP e rua: o único campo era `location`, texto livre interno.
   O erro só aparecia no relatório de carga do portal.
2. **O link copiado apontava para um redirect.** O painel derivava o host da
   barra de endereço (`painel.olmiimoveis.com.br` → `olmiimoveis.com.br`), e a
   Vercel redireciona esse apex (308) para o `www.`. Robô de portal não tem
   obrigação de seguir redirect.

Além disso, em produção (29/09): `tatiane` tinha 20 de 20 imóveis ativos com
descrição abaixo dos 50 caracteres que o VRSync exige; `olmi`, 5 de 62.

## Escopo

- CEP, rua e número no cadastro do imóvel (`properties.address_*`, 0058),
  internos como `location`: o site não publica; o portal recebe e mostra só o
  bairro (`displayAddress="Neighborhood"`).
- Feed em `/feed/<token>/imoveis.xml`, com token por imobiliária
  (`portal_feeds`, 0058), criado na primeira vez que o painel pede o link.
- `/feed/imoveis.xml` passa a responder 410 com instrução de onde pegar o link
  novo.
- Regra única de "o portal aceita?" em `shared/utils/vrsync.ts`
  (`pendenciasVrsync`): o feed deixa de fora o imóvel pendente, o painel diz
  qual e por quê — em Configurações (lista com link para cada imóvel) e no
  próprio formulário do imóvel.
- Link do feed montado no servidor (`/api/admin/portais`) a partir do domínio
  primário.
- `UsageType` no XML; título e descrição cortados nos limites do VRSync.

## Fora do escopo, por decisão

- **Busca de endereço por CEP (ViaCEP etc.).** Seria o primeiro serviço externo
  chamado pelo painel com dado de imóvel; não é preciso para o feed funcionar.
- **Latitude/longitude.** Opcional no VRSync; o portal geocodifica pelo CEP.
- **`Features`.** O VRSync aceita só uma lista fechada em inglês; o diferencial
  daqui é texto livre. Mapear exige tabela de/para — fica para depois.
- **Rotação do token pelo painel.** Dá para trocar direto na tabela se vazar;
  tela para isso só quando alguém precisar.
- **Preencher CEP dos imóveis já cadastrados.** É dado que só a imobiliária tem.
  O painel mostra a lista do que falta.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Endereço em colunas próprias, internas | Extrair CEP de `location` | `location` é texto livre ("perto do mercado"); parse erraria calado |
| Token no caminho da URL | Feed aberto, como antes | Com rua e CEP dentro, seria a lista de endereços de todos os imóveis, aberta a quem pedir |
| Token no caminho | Token na query | O Canal Pro guarda a URL como está; query é o primeiro pedaço a se perder ao copiar/validar |
| Token em tabela própria (`portal_feeds`) | Coluna em `tenants` | `tenants` é lida pelo anon com grant por coluna (0047); um descuido no grant publicaria o token |
| Token em tabela | HMAC do tenant id com segredo de ambiente | Variável de ambiente nova já custou tardes de depuração (ver `nuxt.config.ts`); tabela permite trocar o token de um cliente só |
| Imóvel pendente fica fora do feed | Mandar tudo e deixar o portal recusar | O relatório do portal ninguém lê; o aviso no painel diz o que preencher |
| 404 para token errado | 403 | 403 confirma que há feed no domínio e só falta o token |
| Link a partir do domínio primário | Host da barra de endereço | O apex redireciona para `www.` na Vercel |
| `/feed/imoveis.xml` responde 410 | Continuar servindo sem endereço | Nunca funcionou no Canal Pro; 410 explica a quem abrir que o link mudou |

## Implantação

1. Aplicar `0058_feed_portais.sql`.
2. Deploy.
3. Avisar as imobiliárias que já colaram o link antigo: pegar o novo em
   Configurações e completar CEP/rua dos imóveis listados ali.
