-- Segunda barreira na trilha de auditoria e no recurso pago.
--
-- Card 3.2. Conferido antes de escrever, contra o banco real: um membro do
-- painel NÃO consegue apagar a trilha, adulterá-la, nem ligar o próprio
-- recurso pago. As três tentativas afetaram zero linhas.
--
-- ⚠️ Mas a proteção é IMPLÍCITA: vem da ausência de policy de escrita, não de
-- uma decisão registrada no privilégio. `authenticated` mantém o GRANT default
-- do Supabase (INSERT/UPDATE/DELETE/TRUNCATE) nas duas tabelas; o que barra é a
-- RLS não ter policy permissiva para esses comandos.
--
-- Isso tem um modo de falha específico e silencioso: no dia em que alguém
-- acrescentar uma policy `for all` a uma dessas tabelas — que é o padrão usado
-- em quase todas as outras deste schema — a escrita passa a ser permitida sem
-- que ninguém tenha decidido isso. Não há erro, não há sintoma: a trilha
-- simplesmente vira apagável.
--
-- Para estas duas tabelas o custo de fechar é zero, porque nenhum caminho da
-- aplicação escreve nelas com o token do usuário:
--   - `portal_document_access` é escrita pela service role no download (e a
--     0028 é explícita sobre o porquê: se o cliente pudesse inserir, forjaria
--     linhas e o registro deixaria de valer como prova);
--   - `tenant_features` é escrita por quem vende, nunca pela imobiliária — a
--     migration que a criou diz isso com todas as letras: "se o membro do
--     tenant pudesse dar update aqui, ele ligaria o próprio recurso pago".
--
-- A leitura continua: as duas têm policy de SELECT para o membro, e o painel
-- precisa dela para mostrar a trilha e saber o que está ligado.
--
-- Idempotente: seguro rodar de novo.

revoke insert, update, delete, truncate on public.portal_document_access from authenticated;
revoke insert, update, delete, truncate on public.tenant_features from authenticated;

-- `anon` já não tem nada nas duas (conferido em 16/09), mas repetir é barato e
-- deixa a intenção escrita em vez de dependida.
revoke all on public.portal_document_access from anon;
revoke all on public.tenant_features from anon;

comment on table public.portal_document_access is
  'Trilha de download (LGPD). Escrita SÓ pela service role; authenticated tem apenas SELECT, por policy e por privilégio. Ver 0036.';
comment on table public.tenant_features is
  'Recurso pago por tenant. Escrita SÓ pela service role — a imobiliária não liga o próprio plano. Ver 0036.';
