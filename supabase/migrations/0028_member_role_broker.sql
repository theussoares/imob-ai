-- Papel 'broker' em member_role. Sozinho nesta migration de propósito.
--
-- O Postgres não deixa USAR um valor de enum na mesma transação que o adiciona
-- ("unsafe use of new value of enum type"). Como a 0029 precisa do papel para
-- as policies e o Supabase roda cada migration em transação, juntar as duas
-- faria a 0029 falhar no meio — com o enum já alterado e a RLS não.
--
-- Mesmo motivo pelo qual a 0027 (tipos de imóvel) também veio sozinha.
alter type member_role add value if not exists 'broker';
