# Migrations — leia antes de escrever a próxima

**Esta pasta não é o banco.** Os arquivos numerados `00NN_*.sql` são o que foi
escrito aqui; o histórico real vive em `supabase_migrations.schema_migrations`,
e os dois divergiram.

Descoberto em 16/09, ao ir aplicar quatro migrations pendentes. O que estava
acontecendo:

- migrations aplicadas direto no banco, por MCP, sem nunca serem commitadas —
  oito delas, agora em `aplicadas-em-producao/`;
- os números não batem: `0028` aqui é `client_area`, e em produção é
  `tenant_address`. O mesmo vale para `0005`, `0007`, `0008`, `0009`, `0029`,
  `0030` e `0031`;
- uma dessas migrations não commitadas tem, no próprio cabeçalho, "ver
  `supabase/migrations/0032_tenant_features.sql` no repositório" — arquivo que
  nunca existiu.

## Por que isso é perigoso, e não só bagunçado

Uma migration nova é escrita olhando o que está aqui. Se o que está aqui não é
o banco, ela é escrita contra uma ficção.

Foi o que quase aconteceu: uma migration para o entitlement do portal, escrita
contra a `0028_client_area` desta pasta, ia recriar `contracts_read` e
`portal_documents_read` com as subqueries inline daquele arquivo. Em produção
essas policies já tinham sido trocadas por funções `security definer`
justamente para romper uma **recursão infinita** (erro 42P17). Aplicá-la teria
derrubado o portal inteiro — e o teste do repositório teria passado verde, porque
o teste lê esta pasta.

Ela foi descartada antes de aplicar. Esta pasta de importados existe para que a
próxima não dependa de alguém desconfiar a tempo.

## Antes de escrever uma migration que toca o portal

1. **Leia o banco, não só a pasta.** As policies e funções válidas são as de lá:

   ```sql
   select tablename, policyname, qual from pg_policies
    where schemaname in ('public','storage') and tablename = '<tabela>';

   select pg_get_functiondef(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '<funcao>';
   ```

2. **Nunca recrie uma policy do portal no formato da `client_area`.** As quatro
   policies do portal e a do bucket passam por `portal_my_parties()` e
   `portal_can_read_doc_path()`. Voltar às subqueries inline é reintroduzir a
   recursão. Se precisar mudar a regra, mude **dentro da função**.

3. **Confira o dado antes de mudar comportamento.** Antes de pôr a checagem de
   pasta em `portal_can_read_doc_path`, foi conferido que os documentos
   existentes tinham a pasta certa — se algum não tivesse, o download dele
   pararia, calado. Isso custa uma query.

4. **Commite antes de aplicar.** Foi a regra que faltou.

## `aplicadas-em-producao/`

SQL recuperado de `supabase_migrations.schema_migrations`, exatamente como foi
executado, com um cabeçalho dizendo de onde veio. O nome do arquivo é a
identidade real no banco: `<version>__<name>.sql`.

**Não reaplique nada daí** — já está no histórico. São um registro, não uma fila.

Uma ressalva importante: `portal_can_read_doc_path` aparece em
`corrigir_recursao_policies_portal`, mas foi **alterada depois** pela
`portal_documents_caminho_no_banco`, que acrescentou a checagem de pasta. A
versão válida é a da segunda.

## O que ainda diverge

Os números `0005`, `0007`, `0008`, `0009`, `0028`–`0031` têm nomes diferentes
aqui e lá, e a pasta tem arquivos (`0006` ausente, `0013` e `0031` duplicados)
que sugerem renumeração em algum momento. Reconciliar isso é arqueologia e não
foi feito: o risco de adivinhar errado é maior que o de conviver com a diferença,
desde que ela esteja escrita — que é o que este arquivo faz.

O que importa está resolvido: **tudo que toca o portal está aqui**, e o caminho
para conferir o resto está no passo 1 acima.
