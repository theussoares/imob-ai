# LGPD da Área do Cliente — mapa de dados e retenção

Card 3.2. Este documento é **insumo para advogado**, não substituto de um. Ele
responde o que só quem escreveu o sistema sabe — que dado existe, onde, quem
alcança, por quanto tempo — para que o texto legal seja escrito sobre fato, e
não sobre suposição.

## Quem é quem

Decidido no plano e reafirmado aqui porque tudo depende disso:

- **A imobiliária é CONTROLADORA.** Ela decide quais dados trata e por quê.
- **O imob-ai é OPERADOR.** Trata dado apenas sob instrução dela.

Consequência prática: o direito do inquilino de acessar o próprio contrato
(art. 18) é devido **pela imobiliária**. A política de privacidade que o cliente
final lê é dela, não nossa — o que fornecemos é a estrutura e este mapa.

## Que dado pessoal existe, e onde

| Onde | O que | De quem |
|---|---|---|
| `portal_users` | nome, e-mail, CPF/CNPJ, telefone | cliente final |
| `contracts` | endereço do imóvel, valores, vigência | contrato |
| `contract_parties` | quem é parte, em que papel | cliente final |
| `portal_documents` | metadado do arquivo | — |
| bucket `portal-docs` | **o documento em si** | todas as partes |
| `portal_document_access` | quem baixou o quê, quando, de que IP | cliente final |
| `contract_internal` | anotação, taxa de administração, id no ERP | imobiliária |

O dado mais sensível não está em tabela: está **dentro dos PDFs**. O contrato de
locação real que modelou esta feature traz CPF de três pessoas, endereço
residencial, e o contrato de administração traz conta bancária e chave Pix do
proprietário. É por isso que o bucket é privado, o download é assinado com vida
curta, e há trilha.

## Quem alcança o quê

- **Cliente final:** só o que é do contrato dele e endereçado ao papel dele.
  Verificado contra as policies reais — ver `supabase/tests/isolamento-portal.sql`.
- **Imobiliária (painel):** tudo do próprio tenant, inclusive
  `contract_internal` e a trilha (leitura).
- **Plataforma (service role):** tudo. É o poder que sustenta o download
  assinado e a gravação da trilha.
- **`anon`:** nada. Nenhuma das sete tabelas tem grant para o papel anônimo.

## Retenção

### `portal_document_access` — a trilha

**Não entra no expurgo.** Decisão do plano, e a razão é que ela não é dado
tratado *para* o cliente: é **registro da operação de tratamento**. Apagá-la
junto com o resto destruiria justamente a prova de quem acessou o quê — que é o
que responde a pergunta "quem baixou meu contrato?".

Base legal para sobreviver: art. 16, I e II (cumprimento de obrigação legal e
estudo/auditoria), e o interesse legítimo de manter registro de acesso a dado
pessoal.

**Prazo proposto: 5 anos após o encerramento do contrato de locação.** Alinhado
ao prazo geral de prescrição de pretensões de reparação civil (art. 206, §3º, V
do Código Civil), que é o horizonte em que alguém poderia questionar um acesso.

⚠️ **Esse prazo é proposta de engenharia, não parecer.** Precisa de confirmação
do advogado — é o tipo de número que parece arbitrário e não é.

### Documentos e cadastro

Seguem a régua de inadimplência já decidida no plano: janela de exportação até
**D+90** após a suspensão, eliminação depois, com as exceções do art. 16.

A suspensão por inadimplência **corta o serviço, não retém o dado**: o painel da
imobiliária nunca é cortado (cortar o painel *é* reter dado do cliente, e há
precedente condenando isso), e os arquivos permanecem devolvíveis a ela.

### O que ainda não tem rotina

**Nada disso está automatizado.** Não há job de expurgo, não há exportação em um
clique. Hoje a eliminação seria manual, e a exportação também. Isso é aceitável
enquanto a carteira é de 10 contratos e nenhum cliente pediu; deixa de ser no
dia em que alguém exercer o direito do art. 18 e a resposta depender de alguém
lembrar de rodar um SQL.

Registrado como dívida, não como pronto.

## Para o texto da política, o essencial

O que o cliente final precisa saber, e que o sistema de fato faz:

1. **Quem trata:** a imobiliária, com o imob-ai como operador.
2. **O quê:** nome, e-mail, CPF/CNPJ, telefone, e os documentos do contrato.
3. **Para quê:** dar acesso aos documentos da locação.
4. **Quem mais vê:** as outras partes do contrato **não veem** os documentos
   endereçados a ele. Inquilino não vê extrato de repasse; proprietário não vê
   comprovante de pagamento. Vale dizer isso explicitamente — é uma garantia, e
   é contraintuitiva.
5. **Registro de acesso:** todo download é registrado com data e IP.
6. **Por quanto tempo:** conforme acima.
7. **Como exercer direitos:** pela imobiliária, que é a controladora.

## Conferências desta rodada (16/09)

- `anon` sem grant nas 7 tabelas ✅ (consultado no banco)
- trilha e `tenant_features` fechadas para escrita de `authenticated`
  (migration 0036) ✅ — antes a proteção era só a ausência de policy, que some
  em silêncio se alguém acrescentar uma `for all`
- `notes`, `external_id` e `admin_fee_percent` fora de todo caminho do portal ✅
  (travado por teste, inclusive contra o mapper voltar a espalhar a row)
- URL assinada com 60s, travada por teste entre 30 e 300 ✅
- isolamento entre clientes verificado contra as policies reais ✅
