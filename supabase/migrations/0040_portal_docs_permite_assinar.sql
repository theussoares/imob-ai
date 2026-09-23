-- O download de documento do portal estava quebrado para TODO cliente.
--
-- Sintoma: o cliente entra, vê a lista dos documentos dele, clica para baixar e
-- recebe erro. O servidor loga `portal.assinatura_falhou` e responde 502; o
-- Storage devolve "Object not found" na chamada de assinatura.
--
-- ⚠️ A BASE DE COMPARAÇÃO NÃO É A 0028, e confundir isso é perigoso aqui.
--
-- A policy que estava em produção vinha de
-- `aplicadas-em-producao/20260912190434__corrigir_recursao_policies_portal.sql`
-- mais a `0034`, que trocaram o `exists (...)` inline por
-- `portal_can_read_doc_path(name)` para quebrar uma recursão infinita (42P17).
-- O README desta pasta avisa: **nunca recrie uma policy do portal no formato da
-- `client_area`** — a forma antiga reintroduz a recursão e derruba o portal.
--
-- Esta migration reproduz a policy VIVA (lida de `pg_policies`), não o que o
-- arquivo da 0028 diz. Quem comparar com a 0028 vai achar que uma condição
-- sumiu; ela não sumiu, virou a função, antes deste diff.
--
-- A 0028 previu o defeito abaixo. O comentário dela diz, sobre a lista de
-- operações: "se a operação usada pela assinatura tiver outro nome nesta versão
-- do Storage, o download para de funcionar de forma VISÍVEL (falha fechada, que
-- é o modo certo de errar aqui) e o nome correto entra nesta lista. Conferir no
-- primeiro apply." Nunca foi conferido — e as únicas seis descargas registradas
-- em `portal_document_access` são de 12/09, anteriores à mudança que passou a
-- assinar com o token do cliente em vez de service role.
--
-- CAUSA, isolada experimentalmente (sessão de cliente real, contra este banco):
--   1. o cliente LÊ a linha em `portal_documents`            → passa
--   2. o cliente BAIXA o objeto direto (`object.get_authenticated`) → passa
--   3. o cliente ASSINA a URL                                 → "Object not found"
--   4. service role assina (controle, ignora RLS)             → passa
--
-- Como (2) passa, `portal_can_read_doc_path(name)` está correto e o caminho do
-- objeto casa. A única diferença entre (2) e (3) é o NOME DA OPERAÇÃO, e é por
-- ele que `storage.allow_any_operation` recusa.
--
-- ⚠️ Por que isto NÃO alarga o acesso a dado nenhum: o cliente já consegue
-- baixar o objeto (passo 2). As outras condições da policy continuam intactas —
-- publicado, de um contrato em que ele é parte, e endereçado ao papel dele. O
-- que muda é só o caminho ficar utilizável pelo produto.
--
-- ⚠️ `allow_any_operation` continua existindo pelo motivo original: impedir que
-- dar leitura para baixar vire permissão de LISTAR o bucket, o que deixaria um
-- cliente enumerar os caminhos dos documentos de todos os contratos de todos os
-- tenants. Acrescentar a assinatura não afeta isso — `object.list` segue fora.
--
-- Idempotente: seguro rodar de novo.

drop policy if exists "portal client reads own documents" on storage.objects;

create policy "portal client reads own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-docs'
    and storage.allow_any_operation(
      array['object.get_authenticated', 'object.get_authenticated_info', 'object.sign']
    )
    -- Qualificada, ao contrário da policy que ela substitui: uma policy em
    -- `storage.objects` recriada com outro `search_path` resolveria o nome nu
    -- para lugar nenhum, e o modo de falha seria a policy recusar TUDO — ou
    -- seja, o mesmo download quebrado que esta migration veio consertar.
    and public.portal_can_read_doc_path(name)
  );
