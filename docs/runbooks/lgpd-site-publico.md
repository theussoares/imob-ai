# LGPD do site público: mapa de dados, bases legais e lacunas

Auditoria de 25/09. Continua o `0037-lgpd-area-do-cliente.md`, que cobre só a
Área do Cliente. Este documento cobre o que um **visitante** do site de uma
imobiliária deixa com a gente.

Mesma natureza do 0037: **insumo para advogado, não parecer.** Engenharia
afirma o que o sistema faz. A qualificação jurídica (qual base legal, qual
prazo, que redação) está aqui proposta, com a fonte, para ser confirmada ou
corrigida por quem assina.

## Quem é quem

Igual ao 0037, e vale para o site público também:

- **A imobiliária é CONTROLADORA** do dado do visitante do site dela. Ela
  decide o que coletar no formulário e o que fazer com o contato.
- **A plataforma (imob-ai / Moradi) é OPERADORA.** Hospeda, grava e entrega o
  dado sob instrução da imobiliária.
- A exceção é `usemoradi.com.br`, a landing da própria plataforma. Lá a
  controladora é a plataforma. Hoje a landing não tem formulário; se ganhar um,
  precisa de política própria, não desta.

Consequência: a política de privacidade que o visitante lê é **da imobiliária**.
A página `/privacidade` é um modelo preenchido com o nome dela, e o canal para
exercer direitos é o contato dela.

## O que o site público trata

Verificado no código e no banco em 25/09.

| Tratamento | Dado | Onde fica | Por quanto tempo |
|---|---|---|---|
| Formulário de contato e "Quero vender" | nome, telefone, mensagem, imóvel de interesse; no "Quero vender", tipo e bairro do imóvel | `leads` (Supabase, São Paulo) | **Sem prazo.** Fica até a imobiliária apagar |
| Anti-abuso dos formulários | hash do IP com sal (sha256), não o IP | `leads.ip_hash` | junto com o lead |
| Clique no botão de WhatsApp | imóvel, destino (corretor ou imobiliária), origem do clique, hash do IP | `whatsapp_clicks` | **90 dias**, apagado pelo cron diário |
| Aviso de lead novo para a imobiliária | nome e telefone do lead | e-mail enviado pela Resend (EUA) | caixa de entrada da imobiliária |
| Estatísticas de visita | URL visitada (sem query exceto `utm_*`), país, navegador, dispositivo; visitante identificado por hash do request que **zera todo dia** | Vercel Web Analytics e Speed Insights | conforme a Vercel |
| Processamento de toda requisição | IP, user-agent, URL | funções da Vercel, região `iad1` (EUA) | logs de runtime da Vercel, retenção curta do plano |

**O que o site público NÃO faz** — e é o que sustenta a decisão sobre banner
abaixo:

- não grava cookie nenhum em produção. O único `setCookie` do código
  (`dev_tenant`) só existe fora de produção (`allowTenantSwitch`);
- não carrega pixel de anúncio (Meta, Google Ads), Google Analytics, Tag
  Manager, Hotjar, Clarity ou similar;
- não manda para o Analytics as páginas do painel nem da Área do Cliente
  (`shared/utils/rastreio.ts` descarta os eventos).

## Base legal proposta, por tratamento

| Tratamento | Base proposta | Por quê |
|---|---|---|
| Formulário de contato | **Art. 7º, V** — procedimentos preliminares a contrato, a pedido do titular | A pessoa pede para ser contatada sobre um imóvel. Consentimento seria pior: é revogável a qualquer momento e obriga a parar de responder |
| Anti-abuso (hash de IP) | **Art. 7º, IX** — legítimo interesse (segurança do formulário) | Pseudonimizado, janela curta, expectativa razoável do titular. Art. 10, §3º: a ANPD pode pedir relatório de impacto |
| Clique no WhatsApp | **Art. 7º, IX** — legítimo interesse (saber de qual imóvel veio a conversa) | Não identifica quem clicou; retenção de 90 dias |
| Estatísticas de visita | **Art. 7º, IX** — legítimo interesse (medição de audiência) | O Guia de Cookies da ANPD admite legítimo interesse para medição de audiência. Aqui nem há cookie |
| E-mail de aviso à imobiliária | a mesma base do lead (art. 7º, V) | é o próprio atendimento do pedido |

Legítimo interesse exige, pelo art. 10, §2º, **transparência** sobre o
tratamento. Na prática: tudo que está como art. 7º, IX precisa estar escrito na
política. Hoje não está em lugar nenhum.

## Lacunas encontradas

Por ordem de risco.

### 1. Não há política de privacidade publicada no site público

O art. 9º exige que o titular tenha acesso "de forma clara, adequada e
ostensiva" à finalidade, forma e duração, identificação e contato do
controlador, compartilhamento, responsabilidades e direitos do art. 18. Hoje o
visitante do site só vê a frase junto do botão do formulário ("Usamos seu
contato só para responder a este pedido"). É boa como aviso no ponto de coleta,
mas não cobre o art. 9º.

**Feito nesta rodada:** o rascunho de `/privacidade` passou a cobrir o site
público. Continua **não publicado** (fora de `STATIC_FOOTER_PAGES`, com
`noindex`) até a revisão.

### 2. Leads sem prazo de retenção

O art. 15, I encerra o tratamento quando a finalidade é alcançada, e o art. 16
manda eliminar depois disso, salvo as exceções dele. Um pedido de contato de
dois anos atrás, de alguém que nunca virou cliente, não tem finalidade
presente. A ANPD diz que a LGPD não fixa prazo geral — o controlador define,
pela finalidade (FAQ ANPD 5.5). Então a imobiliária precisa de um número, e o
sistema precisa aplicá-lo.

**Proposta de engenharia:** leads arquivados ou perdidos, sem interação há 24
meses, são eliminados pelo cron que já apaga os cliques. Lead que virou
contrato sai da regra (passa a ser dado do contrato). O número é para o
advogado confirmar; o job é trabalho a fazer depois disso, não antes.

### 3. Transferência internacional sem mecanismo declarado

O banco fica em São Paulo, mas a requisição do formulário passa pelas funções
da Vercel em `iad1` (Washington, EUA), e o aviso de lead sai pela Resend (EUA).
Isso é transferência internacional (art. 33). Os EUA não têm decisão de
adequação da ANPD, então o mecanismo é contratual. A Resolução CD/ANPD nº
19/2024 fixou as cláusulas-padrão e deu até **23/08/2025** para incorporá-las a
contratos que já usavam cláusulas. Já venceu.

A verificar: se os DPAs da Vercel, da Resend e da Supabase já incorporam as
cláusulas-padrão brasileiras, ou só as europeias. Isso é leitura de contrato,
não de código.

**Mudança técnica que reduz o problema:** fixar a região das funções da Vercel
em `gru1` (São Paulo). Os dados do formulário deixariam de passar pelos EUA
antes de chegar ao banco, que já está em São Paulo, e cada requisição deixaria
de cruzar o continente até o banco. Não resolve a Resend nem a Vercel como
empresa, mas tira o caminho principal do dado do exterior. A mudança é uma
opção de região no deploy e deve ser medida antes de ir para produção.

### 4. Registros de acesso (Marco Civil, art. 15)

O art. 15 da Lei 12.965/2014 obriga o provedor de aplicação constituído como
pessoa jurídica, com fins econômicos, a guardar os registros de acesso (data,
hora e IP de uso da aplicação) por **6 meses**, sob sigilo. Hoje a aplicação
não guarda isso: o hash de IP não é o IP, e os logs de runtime da Vercel têm
retenção curta.

Pergunta para o advogado, antes de qualquer código: **quem é o provedor de
aplicação aqui**, a imobiliária (dona do site) ou a plataforma? E o site de
vitrine se enquadra? Guardar IP em claro por 6 meses é tratamento novo, com
risco próprio, e só deve ser feito se a lei de fato exigir, e de quem.

### 5. Canal do titular e encarregado

O art. 41 exige encarregado, e a Resolução CD/ANPD nº 18/2024 exige identidade e
contato dele em destaque no site. A Resolução CD/ANPD nº 2/2022 (art. 11)
dispensa o agente de pequeno porte de indicar encarregado, **desde que
mantenha um canal de comunicação com o titular**.

As imobiliárias clientes provavelmente são de pequeno porte, mas isso é
enquadramento a confirmar caso a caso. A política usa o e-mail da imobiliária
como canal. Se ela tiver encarregado, o nome entra no texto.

### 6. Incidente de segurança

Resolução CD/ANPD nº 15/2024: o controlador comunica incidente relevante à ANPD
e aos titulares em **3 dias úteis** (6 para pequeno porte). Como operadora, a
plataforma precisa avisar a imobiliária a tempo de ela cumprir esse prazo. Isso
deveria constar do contrato com o cliente. Não é texto da política.

## Banner de cookies: decisão

**Não implementar agora.**

- O Guia Orientativo de Cookies da ANPD (out/2022) se aplica a cookies **e a
  tecnologias semelhantes**, e pede consentimento para o que não é
  estritamente necessário, com botão de rejeitar tão visível quanto o de
  aceitar. O banner existe para coletar essa escolha.
- Este site não tem o que pôr em escolha: não grava cookie, e a medição de
  audiência não usa cookie nem identificador persistente (hash de request que
  zera todo dia, sem rastrear entre dias nem entre sites). O próprio guia
  admite legítimo interesse para medição de audiência.
- Um banner sem escolha real é o que o guia chama de má prática: informa sem
  dar controle. E custa conversão no primeiro contato de quem está procurando
  imóvel.

O que a transparência exige, e esta rodada fez, é a seção "Cookies e
estatísticas" na política.

**Quando isto muda:** no dia em que entrar Meta Pixel, Google Ads, Google
Analytics, Tag Manager ou qualquer ferramenta que grave cookie ou identificador
persistente. Nesse dia o banner é obrigatório, e precisa **bloquear o script
até o aceite**, não só avisar. Um banner que avisa mas carrega o pixel antes do
clique é pior que nenhum, porque documenta a violação.

## Para o advogado, em uma lista

1. Revisar o texto de `/privacidade` (rascunho, não publicado).
2. Confirmar as bases legais da tabela acima.
3. Definir o prazo de retenção de leads (proposta: 24 meses sem interação).
4. Ler os DPAs de Vercel, Resend e Supabase quanto às cláusulas-padrão da
   Res. 19/2024.
5. Responder o enquadramento do Marco Civil, art. 15 (item 4).
6. Confirmar se cada imobiliária cliente é agente de pequeno porte (Res. 2/2022).
7. Cláusula de comunicação de incidente no contrato com a imobiliária.

Publicar a página é registrá-la em `STATIC_FOOTER_PAGES` e tirar o `noindex`,
**na mesma mudança**. O link no formulário de contato (`LeadForm.vue`) entra
junto.

## Fontes

O texto oficial no Planalto e no portal da ANPD não pôde ser aberto do ambiente
onde este documento foi escrito (bloqueio de rede). Os dispositivos foram
conferidos por busca, em fontes secundárias que reproduzem o texto legal. O
advogado deve conferir contra o texto compilado vigente.

- LGPD, Lei 13.709/2018 — [texto compilado, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- Marco Civil da Internet, Lei 12.965/2014, art. 15 — [Planalto](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm)
- ANPD, Guia Orientativo Cookies e Proteção de Dados Pessoais (out/2022) — [PDF](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf)
- Resolução CD/ANPD nº 2/2022, agentes de pequeno porte — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- Resolução CD/ANPD nº 15/2024, comunicação de incidente — [LegisWeb](https://www.legisweb.com.br/legislacao/?id=458235)
- Resolução CD/ANPD nº 18/2024, encarregado — [cópia no TJBA](https://www.tjba.jus.br/extrajudicial/wp-content/uploads/2024/08/RESOLUCAO-ANPD-No-18-Encarregado-de-Dados.pdf)
- Resolução CD/ANPD nº 19/2024, transferência internacional — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024); fim do prazo de adaptação — [Mayer Brown](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data)
- ANPD, FAQ 5.5 "Por quanto tempo os dados pessoais podem ser tratados?" — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes/5-adequacao-a-lgpd/5-5-por-quanto-tempo)
- Vercel Web Analytics, privacidade (sem cookies, hash diário) — [Vercel](https://vercel.com/docs/analytics/privacy-policy)
