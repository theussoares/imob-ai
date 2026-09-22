-- O papel `anon` tinha INSERT, UPDATE, DELETE e TRUNCATE em cinco tabelas.
--
-- Achado em 22/09, de lado: ao conferir no banco se uma coluna nova em
-- `tenants` seria legível pelo anon, a consulta de grants devolveu muito mais
-- do que a pergunta pedia. `tenants`, `tenant_domains`, `tenant_members`,
-- `properties` e `property_images` carregavam os quatro comandos de escrita
-- para `anon` — o GRANT default que o Supabase dá a toda tabela nova em
-- `public`, nunca revogado nessas.
--
-- ⚠️ NÃO era exploração aberta, e a distinção importa para quem ler isto depois
-- achando que houve incidente. Verificado no mesmo dia: RLS ligada nas cinco,
-- e TODA policy de escrita passa por `is_tenant_member(...)`, que para um
-- visitante sem sessão é falso. O PostgREST recusava.
--
-- Então por que mexer:
--
--   * a anon key vai no HTML de TODA página pública. O grant é a única camada
--     entre ela e a escrita; hoje quem segura é só a RLS, e isso é uma policy
--     mal escrita de distância de virar buraco de verdade. Defesa em
--     profundidade existe para o dia em que a primeira camada falha.
--   * `TRUNCATE` é o único desses comandos que a RLS **não** governa, por
--     natureza. Hoje ele não tem verbo no PostgREST, o que é uma proteção que
--     não é nossa e pode mudar sem nos avisar.
--   * o repositório já faz exatamente isto em toda tabela interna — 0011 para
--     `brokers`, 0015 para `leads`. O padrão existia; só não tinha sido
--     aplicado no resto. Estas cinco eram a sobra, não uma exceção pensada.
--
-- O que NÃO muda, de propósito:
--
--   * todo `SELECT` que o site público usa. `tenants` e `tenant_domains` são
--     lidas pela anon key na resolução de tenant (`getTenantBySlug` /
--     `getTenantByDomain`, chamadas com `publicSupabase()` em
--     `server/utils/tenant.ts`); `property_images` alimenta o catálogo. A
--     privacidade por coluna de `properties` (0005/0011) fica intacta.
--   * TUDO do papel `authenticated`. O painel grava configuração do tenant com
--     o client DO USUÁRIO — `server/api/admin/tenant.put.ts` chama
--     `updateTenantSettings(client, ...)`, não `serviceSupabase()`. Revogar
--     UPDATE do `authenticated` aqui quebraria a tela de configurações, e o
--     erro apareceria só na hora de salvar.
--
-- `revoke` de privilégio ausente não erra: rodar de novo é seguro.

revoke insert, update, delete, truncate on public.tenants         from anon;
revoke insert, update, delete, truncate on public.tenant_domains  from anon;
revoke insert, update, delete, truncate on public.tenant_members  from anon;
revoke insert, update, delete, truncate on public.properties      from anon;
revoke insert, update, delete, truncate on public.property_images from anon;

-- `tenant_members` mapeia usuário -> imobiliária -> papel. É dado interno, e o
-- site público não tem caminho que a leia: quem lê é `getMembership`, sempre
-- com o client autenticado. O grant de leitura para `anon` era sobra igual aos
-- de escrita.
--
-- ⚠️ Isto só é seguro por um motivo que foi conferido no banco antes, e não
-- deduzido: `is_tenant_member(uuid)` é SECURITY DEFINER. Ela lê
-- `tenant_members` com os privilégios do dono, então continua respondendo
-- `false` para o visitante em vez de estourar "permission denied".
--
-- Se um dia alguém trocar essa função para SECURITY INVOKER, esta linha passa a
-- derrubar `properties_public_read` para todo visitante — a policy é
-- `status = 'active' OR is_tenant_member(tenant_id)`, e o segundo ramo iria a
-- erro em vez de a falso. O catálogo inteiro sairia do ar.
revoke select on public.tenant_members from anon;
