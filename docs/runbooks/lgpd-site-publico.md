# LGPD do site público: mapa de dados, bases legais e lacunas

Auditoria de 25/09. Continua o `0037-lgpd-area-do-cliente.md`, que cobre só a
Área do Cliente. Este documento cobre o que um **visitante** do site de uma
imobiliária deixa com a gente.

A primeira metade é fato do sistema, verificado no código e no banco. A
segunda é o parecer: posição sobre cada questão jurídica em aberto, com
fundamento e fonte.

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
| Processamento de toda requisição | IP, user-agent, URL | funções da Vercel, região `gru1` (São Paulo) desde 25/09; antes `iad1` (EUA) | logs de runtime da Vercel, retenção curta do plano |

**O que o site público NÃO faz** — e é o que sustenta a decisão sobre banner
abaixo:

- não grava cookie nenhum em produção. O único `setCookie` do código
  (`dev_tenant`) só existe fora de produção (`allowTenantSwitch`);
- não carrega pixel de anúncio (Meta, Google Ads), Google Analytics, Tag
  Manager, Hotjar, Clarity ou similar;
- não manda para o Analytics as páginas do painel nem da Área do Cliente
  (`shared/utils/rastreio.ts` descarta os eventos).

## Parecer

Revisão feita em 25/09, depois do mapa acima, com o método de uma verificação
de conformidade: para cada questão, a posição adotada, o fundamento, o risco
que sobra e a ação que falta.

⚠️ **Não é parecer de advogado inscrito na OAB.** Foi pedido que a revisão
fosse feita sem advogado, e ela foi. Onde a conclusão depende de fato que o
sistema não mostra (porte da imobiliária, texto dos contratos com
fornecedores), isso está dito. Se um dia houver advogado, este é o ponto de
partida dele, não o ponto final.

### Q1. Bases legais

| Tratamento | Base | Fundamento |
|---|---|---|
| Formulário de contato e "Quero vender" | **art. 7º, V** | O titular pede para ser contatado sobre um imóvel: é procedimento preliminar a um contrato (compra, venda, locação, intermediação) a pedido dele. Consentimento seria pior: revogável a qualquer momento, e revogado obriga a parar de responder |
| E-mail de aviso à imobiliária | **art. 7º, V** | É o próprio atendimento do pedido |
| Anti-abuso (hash de IP) | **art. 7º, IX** | Legítimo interesse em segurança do formulário. Passa no teste do art. 10: finalidade legítima e concreta (barrar envio em massa), necessidade (sem isso não há limite por origem), expectativa razoável do titular, dado pseudonimizado |
| Clique no WhatsApp | **art. 7º, IX** | Legítimo interesse em saber de qual imóvel veio a conversa. Não identifica quem clicou; 90 dias de retenção |
| Estatísticas de visita | **art. 7º, IX** | O Guia de Cookies da ANPD admite legítimo interesse para medição de audiência. Aqui nem há cookie |

**Posição:** confirmadas. **Risco residual:** baixo. **Ação:** o art. 10, §2º
exige transparência para o legítimo interesse, e a política agora descreve os
três tratamentos que usam essa base.

### Q2. Prazo de retenção dos leads

**Posição:** 24 meses sem interação, depois eliminação. Lead que virou negócio
sai da regra, porque passa a ser dado do contrato.

**Fundamento:** o art. 15, I encerra o tratamento quando a finalidade é
alcançada ou o dado deixa de ser necessário, e o art. 16 manda eliminar
depois. A LGPD não fixa prazo; a ANPD diz que o controlador o define pela
finalidade (FAQ 5.5). Venda de imóvel tem ciclo longo: quem pergunta hoje pode
comprar daqui a um ano. Com 24 meses sem contato, a finalidade "responder a
este pedido" já se esgotou com folga.

**Feito em 25/09.** O cron diário apaga leads sem nenhuma alteração há 24
meses (`purgeStaleLeads`, prazo em `LEAD_RETENCAO_MESES`). Ficam de fora os
leads `fechado` e os que têm retorno agendado no futuro. A política mostra o
prazo lido da mesma constante, então o número prometido e o aplicado não têm
como divergir. No dia em que foi ligado, havia um lead só, de 09/09, e nada
seria apagado antes de 2028.

**Risco residual:** baixo.

### Q3. Transferência internacional

**Posição:** o caminho principal do dado já está coberto. Um fluxo menor não
está.

**Fundamento:** o art. 33, IX permite a transferência "quando necessário para
atender as hipóteses previstas nos incisos II, V e VI do art. 7º". Então:

- **formulário e e-mail de aviso** (art. 7º, V): a passagem pelas funções da
  Vercel nos EUA e o envio pela Resend estão cobertos pelo art. 33, IX, sem
  depender de cláusula contratual;
- **estatísticas da Vercel:** a Vercel declara guardar só dado anonimizado.
  Dado anonimizado não é dado pessoal (art. 12). O IP bruto só existe durante
  o processamento da requisição;
- **clique no WhatsApp e anti-abuso** (art. 7º, IX): legítimo interesse **não**
  está na lista do art. 33, IX. O hash de IP é pseudonimizado, não anonimizado:
  a plataforma tem o sal e consegue refazer a associação, então continua sendo
  dado pessoal. Até 25/09 ele era calculado numa função em `iad1` (EUA), o
  que exigiria outro mecanismo do art. 33, na prática as cláusulas-padrão da
  Res. CD/ANPD 19/2024 no contrato com a Vercel.

**Feito em 25/09.** As funções da Vercel rodam em `gru1` (São Paulo),
configurado em `nitro.vercel.functions.regions` no `nuxt.config.ts`. O hash
passa a ser calculado no Brasil, e a lacuna fecha sem depender de contrato.
Também cai a latência: antes, cada requisição ia a Washington e voltava a São
Paulo para falar com o banco.

**Risco residual:** baixo. O que continua saindo do país (e-mail de aviso,
estatísticas anonimizadas) tem fundamento, como descrito acima.

### Q4. Registros de acesso (Marco Civil, art. 15)

**Posição:** **a obrigação existe e é da plataforma.** Hoje não é cumprida.

**Fundamento:** o art. 15 obriga "o provedor de aplicações de internet
constituído na forma de pessoa jurídica e que exerça essa atividade de forma
organizada, profissionalmente e com fins econômicos" a guardar os registros de
acesso por 6 meses. Registro de acesso é "data e hora de uso de uma
determinada aplicação de internet a partir de um determinado endereço IP"
(art. 5º, VIII). Quem opera a aplicação, profissionalmente e com fins
econômicos, é a plataforma, não a imobiliária. A imobiliária é cliente dela.

**Risco residual:** baixo no dia a dia, alto no dia em que chegar uma ordem
judicial pedindo quem acessou o painel ou o formulário numa data, e não houver
o que entregar.

**Ação:** guardar, por 6 meses e sob sigilo, data/hora, IP e aplicação (host)
de cada requisição. A base legal é o art. 7º, II (obrigação legal), e o
tratamento é o mínimo que a lei pede: nada de corpo de requisição nem de
URL completa. O caminho mais barato é um log drain da Vercel para um
armazenamento com retenção de 180 dias. Tem custo e é infraestrutura, então é
decisão de quem paga a conta. Não é código deste repositório.

### Q5. Encarregado e canal do titular

**Posição:** a imobiliária típica está **dispensada** de indicar encarregado e
cumpre a lei com o e-mail dela como canal. A plataforma, como operadora, não é
obrigada a indicar.

**Fundamento:** a Res. CD/ANPD 2/2022 dispensa o agente de pequeno porte
(microempresa, empresa de pequeno porte, startup) de indicar encarregado, desde
que mantenha canal com o titular (art. 11). Ela deixa de valer quando o
tratamento é de **alto risco**, que exige ao mesmo tempo um critério geral
(larga escala, ou afetar significativamente direitos) e um específico
(tecnologia inovadora, vigilância, decisão automatizada, dado sensível ou de
criança). Uma vitrine de imóveis com formulário de contato não atende nenhum
critério específico. A Área do Cliente tem documentos com CPF, mas CPF não é
dado sensível no sentido do art. 5º, II.

**Risco residual:** depende do porte, que o sistema não sabe. Imobiliária que
não seja ME/EPP precisa indicar encarregado, e o nome dele entra na política
(Res. CD/ANPD 18/2024: identidade e contato em destaque no site).

**Feito:** a política mostra um canal mesmo quando a imobiliária não tem
e-mail. A ordem é e-mail, depois WhatsApp, depois telefone
(`shared/utils/canal-titular.ts`). Antes, a frase de direitos terminava sem
canal nenhum, e esse era o caso da `tatiane` em 25/09.

**Ação:** perguntar o porte no cadastro de cada cliente novo. Para quem não for
de pequeno porte, adicionar o nome do encarregado à página.

### Q6. Incidente de segurança

**Posição:** obrigação da imobiliária (controladora), com dependência da
plataforma.

**Fundamento:** a Res. CD/ANPD 15/2024 dá 3 dias úteis ao controlador para
comunicar à ANPD e aos titulares (6 para pequeno porte), contados de quando ele
sabe do incidente. Quem vai saber primeiro é a plataforma.

**Ação:** cláusula no contrato com a imobiliária: a plataforma avisa em até 24
horas de quando tomar conhecimento de incidente com dado dela. É texto de
contrato, não código.

### Q7. Publicação da política

**Feito em 25/09.** A página está em `STATIC_FOOTER_PAGES` como
`obrigatoria`: aparece no rodapé de todas as imobiliárias, e o painel deixa
trocar o nome do link mas não esconder. Saiu o `noindex`, e os dois
formulários (contato e "Quero vender") ganharam o link no aviso de coleta.

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

O que a transparência exige está na seção "Cookies e estatísticas" da política.

**Quando isto muda:** no dia em que entrar Meta Pixel, Google Ads, Google
Analytics, Tag Manager ou qualquer ferramenta que grave cookie ou identificador
persistente. Nesse dia o banner é obrigatório, e precisa **bloquear o script
até o aceite**, não só avisar. Um banner que avisa mas carrega o pixel antes do
clique é pior que nenhum, porque documenta a violação.

## Ações, por dono

| # | Ação | Dono | Prioridade |
|---|---|---|---|
| 1 | ~~Publicar `/privacidade` (Q7)~~ feito em 25/09 | engenharia | — |
| 2 | ~~Expurgo de leads em 24 meses (Q2)~~ feito em 25/09 | engenharia | — |
| 3 | Guarda de registros de acesso por 6 meses (Q4) | infraestrutura (custo) | média |
| 4 | ~~Funções da Vercel em `gru1` (Q3)~~ feito em 25/09 | engenharia | — |
| 5 | Cláusula de incidente no contrato com a imobiliária (Q6) | comercial | média |
| 6 | Porte do cliente no cadastro; encarregado de quem não for pequeno porte (Q5) | comercial | baixa |

## Mantendo isto verdadeiro

Este documento e a política descrevem o sistema de 25/09. Cada coisa nova que
colete dado, grave cookie ou fale com terceiro os desatualiza. Duas travas
existem para isso:

- `CLAUDE.md`, seção "Privacidade (LGPD)": a regra, lida no começo de toda
  sessão de desenvolvimento;
- `test/server/privacidade-guardrail.test.ts`: cai quando aparece cookie,
  script de terceiro na CSP, serviço externo no servidor ou campo novo gravado
  sobre o visitante, e diz qual seção rever.

O teste não vê tudo. Mudar a região das funções da Vercel, trocar de
fornecedor por configuração ou mudar um prazo de retenção não quebra nada, e
também pede revisão da tabela "O que o site público trata" e da questão
correspondente acima.

## Fontes

O texto oficial no Planalto e no portal da ANPD não pôde ser aberto do ambiente
onde este documento foi escrito (bloqueio de rede). Os dispositivos foram
conferidos por busca, em fontes secundárias que reproduzem o texto legal. Vale
conferir contra o texto compilado vigente antes de citar em qualquer
documento externo.

- LGPD, Lei 13.709/2018 — [texto compilado, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- Marco Civil da Internet, Lei 12.965/2014, art. 15 — [Planalto](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm)
- ANPD, Guia Orientativo Cookies e Proteção de Dados Pessoais (out/2022) — [PDF](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf)
- Resolução CD/ANPD nº 2/2022, agentes de pequeno porte — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- Resolução CD/ANPD nº 15/2024, comunicação de incidente — [LegisWeb](https://www.legisweb.com.br/legislacao/?id=458235)
- Resolução CD/ANPD nº 18/2024, encarregado — [cópia no TJBA](https://www.tjba.jus.br/extrajudicial/wp-content/uploads/2024/08/RESOLUCAO-ANPD-No-18-Encarregado-de-Dados.pdf)
- Resolução CD/ANPD nº 19/2024, transferência internacional — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024); fim do prazo de adaptação — [Mayer Brown](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data)
- ANPD, FAQ 5.5 "Por quanto tempo os dados pessoais podem ser tratados?" — [ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes/5-adequacao-a-lgpd/5-5-por-quanto-tempo)
- LGPD art. 33, IX (transferência para atender art. 7º, II, V e VI) — [Aurum, arts. 33 a 36 comentados](https://www.aurum.com.br/blog/lgpd-comentada/art-33-a-36-lgpd/)
- LGPD art. 12 (dado anonimizado) e art. 13, §4º (pseudonimização) — [Migalhas](https://www.migalhas.com.br/coluna/migalhas-de-protecao-de-dados/332299/o-dado-pseudonimizado-e-um-dado-protegido-pela-lei-geral-de-protecao-de-dados)
- LGPD art. 7º, V e IX e art. 10 — [Aurum, arts. 7 a 10 comentados](https://www.aurum.com.br/blog/lgpd-comentada/art-7-a-10-lgpd/)
- Marco Civil art. 5º, VIII (definição de registro de acesso) — [Jusbrasil](https://www.jusbrasil.com.br/topicos/27363883/inciso-viii-do-artigo-5-da-lei-n-12965-de-23-de-abril-de-2014)
- Res. CD/ANPD 2/2022, critérios de alto risco (art. 4º) — [Migalhas](https://www.migalhas.com.br/depeso/362499/resolucao-cd-anpd-2-22-analise-baseada-em-risco-e-alcance-da-norma)
- Vercel Web Analytics, privacidade (sem cookies, hash diário) — [Vercel](https://vercel.com/docs/analytics/privacy-policy)
