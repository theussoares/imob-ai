-- Intervalo mínimo entre pedidos de redefinição de senha, por cliente.
--
-- O endpoint /api/portal/recuperar-senha é público por natureza: quem esqueceu
-- a senha não está logado. Sem trava, ele vira uma máquina de mandar e-mail em
-- nome da imobiliária para qualquer endereço que já seja cliente dela.
--
-- Dois estragos, e o segundo é o que assusta:
--   1. o cliente recebe uma enxurrada de "redefinir sua senha" que não pediu;
--   2. a cota de envio acaba. O plano gratuito de entrada são 100 e-mails por
--      DIA — um abusador esgota isso em um minuto, e a partir daí nenhum
--      convite e nenhuma recuperação legítima sai, para nenhum tenant.
--
-- Contador em memória não serve (serverless: cada requisição pode cair em outra
-- instância — é a mesma razão documentada em `server/utils/rate-limit.ts`), e
-- a trilha de download não serve como fonte: ela conta downloads, não pedidos
-- de senha.
--
-- A chave é a PESSOA, que é a granularidade certa: cada conta recebe no máximo
-- um e-mail por janela, e o teto de abuso passa a ser o número de clientes
-- reais, não infinito.
--
-- Idempotente: seguro rodar de novo.

alter table public.portal_users
  add column if not exists last_recovery_at timestamptz;

comment on column public.portal_users.last_recovery_at is
  'Último pedido de redefinição de senha atendido. Base do intervalo mínimo — ver /api/portal/recuperar-senha.';

-- Sem índice de propósito: a coluna só é lida na linha que a consulta por
-- (tenant_id, email) já encontrou, e aquele índice único já existe.
