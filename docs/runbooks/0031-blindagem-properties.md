# Runbook — 0031 (blindagem de `properties`)

Migration que **não é aditiva**: ela tira privilégio de leitura que o código em
produção hoje usa. Por isso tem ordem obrigatória e rollback ensaiado.

Serve de modelo para qualquer migration futura da mesma forma — a que revoga algo
que o código já consome.

## Como o deploy funciona aqui

Confirmado no projeto Vercel `imob-ai` (time `Matheus' projects`, plano hobby,
ligado a `theussoares/imob-ai`):

- **Produção sai de `main`.** Só commits de `main` recebem `target: production`.
- `develop` e branches de feature recebem **preview** com URL própria.
- Preview no plano hobby herda as variáveis de ambiente — ou seja, **a preview
  aponta para o Supabase de produção**. Dá para testar o código novo contra o
  banco atual antes do merge.

## A propriedade que torna isso seguro

O código novo funciona nos **dois** estados do banco:

| | grants antigos | grants novos (pós-0031) |
|---|---|---|
| código antigo (token do usuário) | ✅ funciona | ❌ `permission denied` |
| código novo (service role) | ✅ funciona | ✅ funciona |

Só existe uma combinação quebrada: **código antigo + grants novos**. Todo o
cuidado da ordem existe para nunca passar por ela.

## Ordem de aplicação

1. **Merge da branch em `main`** e aguardar o deploy de produção ficar `READY`.
2. **Conferir o painel com o código novo e os grants antigos.** Listar imóveis,
   abrir um, salvar uma edição. É a combinação da linha 2, coluna 1 da tabela —
   tem que funcionar igual a antes.
3. **Só então aplicar a 0031.**
4. **Conferir o painel de novo**, mais a bateria de verificação do banco (abaixo).

O intervalo entre 1 e 3 pode ser de minutos ou de dias. Enquanto ele durar, a
brecha continua aberta — que é o estado de hoje, não uma regressão.

## Rollback

### Se o problema aparecer DEPOIS de aplicar a 0031

Uma linha, efeito imediato, sem deploy e sem cache no caminho:

```sql
grant select on public.properties to authenticated;
```

Está em `supabase/migrations/rollback/0031_rollback.sql`. Devolver o privilégio
de TABELA faz o de coluna virar irrelevante, porque quando os dois coexistem o de
tabela prevalece.

O código novo continua funcionando nesse estado — não precisa tocar no deploy.

### Se o problema aparecer no CÓDIGO

Vercel → Instant Rollback para o deployment de produção anterior. Sem rebuild,
questão de segundos. Havia dois candidatos válidos (`isRollbackCandidate: true`)
na última conferência.

⚠️ **Ordem do rollback é o INVERSO da ordem de aplicação: banco primeiro, código
depois.** Voltar o código com os grants novos aplicados é justamente a combinação
quebrada — o painel cai. Se precisar voltar o código, rode o SQL acima ANTES.

### Se o portal já estiver no ar quando o rollback for necessário

O rollback reabre a brecha para `authenticated`, que inclui cliente do portal.
Nesse caso, **desligue o entitlement do portal (card 0.6) antes** de rodar o
`grant`. Sem o portal ligado, o único autenticado é a imobiliária e a brecha
volta a ser inofensiva.

## Verificação pós-apply

Pelo painel: listar imóveis, abrir um, editar e salvar, criar um novo, excluir.
Confirmar que `owner_name` e `owner_phone` continuam visíveis.

Pelo site público: catálogo, detalhe de imóvel, e o botão de WhatsApp indo para o
corretor captador (ou para a imobiliária, quando não houver).

No banco, a mesma bateria usada na 0029/0030 — papel a papel, com `set local
role`, conferindo que:

- `anon` continua lendo imóveis ativos, tenants e domínios
- usuário autenticado **não-membro** não lê `owner_name`, `owner_phone`,
  `location`, `broker_id` nem `updated_by`
- `authenticated` continua lendo as 22 colunas públicas

E os advisors de segurança e performance, comparando com o estado anterior.
