-- Rollback da 0037.
--
-- ⚠️ Reabre o caminho de escalada: sem esta coluna, `convidarClientePortal`
-- volta a decidir o token pela existência da linha em `portal_users`, e
-- convidar duas vezes o e-mail de um terceiro volta a produzir um link de
-- redefinição de senha real na caixa dele. Só reverta junto com o código.

alter table public.portal_users
  drop column if exists access_confirmed_at;
