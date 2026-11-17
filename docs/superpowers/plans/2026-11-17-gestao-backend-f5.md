# Gestão backend — F5 Imóveis (espelho do catálogo): plano detalhado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Passos em checkbox (`- [ ]`).

**Goal:** endpoints `/api/gestao/imoveis/**` que fazem do cadastro de imóveis do gestão um espelho do catálogo: gravam em `properties` / `property_images` (a mesma tabela do `/admin`), sem tabela nova.

**Spec:** `2026-11-17-gestao-imoveis-espelho-design.md` · **Plano-mãe:** `2026-11-17-gestao-backend.md` (Fase F5)

## Arquitetura

```
server/api/gestao/imoveis*.ts          wrappers de 5 linhas: contexto → função do núcleo
server/utils/gestao-imoveis-contexto.ts  monta ContextoImoveis a partir de requireGestaoMember (F1) — único ponto que depende da F1
server/utils/gestao-imoveis.ts         núcleo (listar/obter/criar/atualizar/status/destaque/excluir/fotos); recebe ctx por parâmetro
server/utils/gestao-fotos.ts           data URL → bytes validados (magic bytes) + upload ao bucket property-images
server/utils/gestao-imoveis-locacoes.ts  regra plugável «locação ativa» (TODO F4)
server/mappers/gestao-imovel.ts        Property → ImovelGestao; corpo cru → NovoImovel; NovoImovel → PropertyInput
server/repositories/property.repository.ts  +filtro por corretor/limite na listagem, update sem tocar fotos, status, operações de foto escopadas
```

O núcleo **não importa nada da F1**: recebe `ContextoImoveis` (membro, tenant, matriz, db + quatro dependências injetadas: `registrar`, `invalidarCache`, `armazenarFoto`, `locacoesDoImovel`). Assim os testes rodam sem `vi.mock` de módulo e a F1 só precisa existir no wrapper de contexto.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Regra de permissão = `permissoesImovel`/`podeExcluirImovel` do domínio (não `exigirPermissao`) | `exigirPermissao(ctx,'editar')` por rota | A matriz tem `editar = nao` para jurídico, mas a spec manda jurídico/recepção mudarem status e editarem; o domínio já decidiu isso e a tela usa o mesmo código |
| Imóvel fora do escopo do corretor → **404** | 403 | Não vaza existência (Review Focus 1) |
| `brokerId` do corretor é forçado no servidor (criar e editar); troca só para quem `trocarCorretor`; o id do corretor é conferido no tenant (`getBroker`) | Confiar no body | `broker_id` de outro tenant violaria o isolamento |
| PUT usa `updatePropertySemImagens` | `updateProperty` com as imagens relidas | `replaceImages` apaga e reinsere tudo: corrida com upload de foto perderia fotos |
| Foto sobe pelo servidor (data URL → bucket), caminho gerado no servidor `<slug>/<ts>-<rand>.<ext>`, tipo pelos magic bytes | URL assinada para o cliente subir | Corretor não tem login de `tenant_members`, então não passa na policy de storage da 0012; o caminho nunca vem do cliente; mantém o contrato `FotoNova` do mock |
| Limite do servidor: 20 fotos/imóvel, 4 por requisição | 6 (limite do mock) | Os 6 são teto do localStorage; o `/admin` não tem teto. 4 por requisição cabe nos 4,5 MB da Vercel |
| Foto removida não apaga o objeto do Storage | Apagar no remove | O `/admin` também não; a varredura de órfãos (`orphan_property_images`) cuida |
| Código do imóvel gerado no servidor (`IM-0001…`, maior sufixo numérico + 1; 1 retentativa em 23505) | Pedir código no formulário | O formulário do gestão não tem código (`code` é obrigatório em `properties`) |
| Listagem: 200 itens, `updated_at desc` (constraint do plano-mãe) | Sem limite como o `/admin` | Segue o plano; **risco**: catálogo > 200 esconde imóveis — ver relatório |
| «Locação ativa» plugável, padrão `[]` | Ler `gestao_locacoes` | Tabela é da F4 e ainda não existe |

## Tarefas

- [ ] **T1 Mapper** (`test/server/gestao-imovel-mapper.test.ts`): `toImovelGestao` não carrega `updatedBy`/`broker`/`tenantId`; `brokerId`/`ownerName` nulos viram `''`; `lerCorpoImovel` recusa tipos errados sem lançar; `toPropertyInput` põe `code` e `images`.
- [ ] **T2 Repositório** (`test/server/gestao-imoveis-repository.test.ts` + guardrail): filtro `broker_id`, limite/ordem; update sem fotos não toca `property_images`; operações de foto checam o imóvel no tenant antes e filtram por `property_id`.
- [ ] **T3 Fotos utilitário** (`test/server/gestao-fotos.test.ts`): data URL inválida, tipo declarado ≠ bytes, svg, tamanho, caminho gerado com slug.
- [ ] **T4 Núcleo** (`test/server/gestao-imoveis.test.ts`): Review Focus 1 (corretor A × B → 404 em get/put/delete/status/destaque/fotos), brokerId forçado, tenant em toda query, duplicado, 409 de versão, exclusão com locação ativa, eventos, cache invalidado, sem `tenantId` do body.
- [ ] **T5 Endpoints + contexto** (`test/server/gestao-imoveis-endpoints.test.ts`): wrappers chamam o núcleo com o contexto da sessão; id malformado → 400.
- [ ] **T6 Guardrail público**: nenhuma função nova usa `select('*')` fora do que já é permitido; colunas internas não aparecem em rota pública (suíte existente continua verde).
- [ ] **T7** `tenant-security-reviewer` → corrigir → `pnpm test` → commit e push em `claude/friendly-planck-u9wtqu-f5`.
