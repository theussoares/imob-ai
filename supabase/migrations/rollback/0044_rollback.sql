-- Rollback da 0044.
--
-- ⚠️ Devolve ao papel `anon` a escrita em cinco tabelas. Só rode isto se a
-- revogação tiver quebrado alguma coisa — e, nesse caso, o que quebrou merece
-- ser entendido antes, porque NENHUM caminho conhecido do app escreve como
-- `anon`: as escritas públicas passam por `serviceSupabase()` depois de
-- validação no servidor (invariante 4 do CLAUDE.md), e o painel escreve como
-- `authenticated`.
--
-- Ou seja: se algo quebrou, a hipótese mais provável não é "faltou o grant" —
-- é que existe um caminho escrevendo direto pelo banco com a anon key, que é
-- exatamente o que a 0044 fecha. Reverter esconde o sintoma.
--
-- O candidato realista a quebrar é a ÚLTIMA linha da 0044, não as de escrita:
-- se `is_tenant_member` tiver virado SECURITY INVOKER em algum momento,
-- revogar o SELECT de `tenant_members` derruba `properties_public_read` para
-- visitante e o catálogo some. Nesse caso reverta SÓ o select, não o resto.

grant select on public.tenant_members to anon;

-- Abaixo, o resto — reverta apenas se souber qual caminho precisava disto.

grant insert, update, delete, truncate on public.tenants         to anon;
grant insert, update, delete, truncate on public.tenant_domains  to anon;
grant insert, update, delete, truncate on public.tenant_members  to anon;
grant insert, update, delete, truncate on public.properties      to anon;
grant insert, update, delete, truncate on public.property_images to anon;
