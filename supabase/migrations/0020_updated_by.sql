-- Quem alterou por último cada registro editável.
--
-- Com 4 a 6 pessoas por imobiliária, "quem apagou o NC-0231?" ou "quem mudou o
-- preço?" passaram a ser perguntas legítimas — e hoje não têm resposta nem no
-- banco nem no log. Entre pessoas de igual poder isso não é controle, é memória:
-- quem mexeu geralmente sabe por quê, e sem o registro ninguém sabe a quem
-- perguntar.
--
-- Referencia `auth.users` com ON DELETE SET NULL: usuário removido não deve
-- impedir a linha de existir, e o histórico simplesmente passa a não ter autor.

alter table public.properties add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.leads      add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.tenants    add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Sem backfill: inventar autor para o que já existe seria pior que admitir que
-- não sabemos. Registro antigo fica sem autor até alguém editá-lo.

-- Nota: não vai coluna em `brokers` nem em `property_images`. Corretor é
-- cadastro raro, e imagem é reescrita inteira a cada save do imóvel — o autor
-- dela é o autor do imóvel.
