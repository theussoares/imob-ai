# Painel de gestão — Imóveis como espelho do catálogo

Continuação de `2026-11-17-gestao-telas-mock-design.md` (item 8, Imóveis).

## Motivo

Decisão de 17/11: o cadastro de imóveis do `/gestao` deve ser **espelho do catálogo do site** —
cadastrar, alterar, excluir, mudar status e enviar fotos no gestão é fazer o mesmo no site. Hoje a
tela tem 6 campos e um modelo próprio (`ImovelGestao`), decidido de propósito para não espalhar
colunas internas; isso cai, porque dois cadastros de imóvel divergiriam.

O espelho de verdade só existe com o backend (login real; `/api/admin/properties` exige Supabase
Auth e corretor não tem login). Então: **agora o cadastro completo em mock, atrás de uma interface;
no backend troca-se só a implementação** por chamadas a `/api/admin/properties`.

## Escopo

1. Modelo do imóvel do gestão = campos do `Property` de `shared/models` (código, título, tipo,
   finalidade, preço, bairro/cidade/UF, CEP/rua/número, quartos, suítes, banheiros, vagas, área, alto
   padrão, descrição, características, status, destaque, fotos) + dados internos (proprietário, telefone
   do proprietário, corretor captador).
2. Formulário completo (criar e editar), validação em módulo puro testado em Node.
3. Mudar status (`active | draft | sold | rented`), destaque, excluir com confirmação.
4. Fotos: enviar várias, escolher capa, reordenar, remover.
5. Corretor: o imóvel que ele cria fica com ele como captador; ele vê e altera só os dele
   (`verTodos = proprio`, mesma matriz das vendas). Recepção, jurídico e dono veem todos.
6. Contato público: **sempre o número da imobiliária**. Não há campo de telefone de corretor
   publicável; o telefone do proprietário é interno. A tela mostra o número do site, só leitura,
   vindo de Configurações.
7. `imovelId` das locações segue ligando ao imóvel (ids `im-101…` do seed preservados).

## Fora do escopo por decisão

- Backend, Supabase, Storage, RLS, endpoint real (fase seguinte, junto com o login real).
- Publicar de verdade no site no demo: a etiqueta «No site / Rascunho» reflete o status, mas só o
  backend faz o imóvel aparecer no catálogo.
- Descrição por IA, feed dos portais, importação em massa.
- Sincronizar status com contratos (venda concluída → `sold`, locação aberta → `rented`).

## Approaches

| Abordagem | Resultado |
|---|---|
| 1. Cadastro completo em mock atrás de interface; espelho no backend | **Escolhida** |
| 2. Ligar já ao CRUD real só para dono/admin | Descartada: o demo escreveria no banco de produção (develop e produção dividem o banco) e corretor/recepção ficariam sem acesso |
| 3. Tenant de teste com banco separado | Descartada: infraestrutura antes de qualquer tela |

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `ImoveisRepository` (listar, obter, criar, atualizar, excluir, status, fotos) com `MockImoveisRepository` agora e `HttpImoveisRepository` no backend | Store chamando o mock direto | Trocar para `/api/admin/properties` não mexe em tela |
| Tipo, finalidade e status usam as listas fechadas de `shared/models` (`PROPERTY_TYPES`, `PropertyPurpose`, `PropertyStatus`) | Listas próprias do gestão | Fonte única; senão o espelho traduz e perde valor |
| Validação em `domain/imoveis.ts` (pura) | Validar no componente | Migra para o servidor sem reescrever |
| Fotos no mock: redimensionadas no cliente (≤ 1280 px, JPEG) e guardadas no localStorage, no máximo 6 por imóvel | Guardar o arquivo original | O limite do localStorage (~5 MB) estouraria; no backend vai para o Storage |
| Chave do localStorage sobe para `gestao-demo-v5` | Manter `v4` | O estado antigo não tem os campos novos |
| «Situação» (disponível / em locação) continua derivada das locações e separada do status do site | Fundir os dois | São coisas diferentes: o status é o anúncio, a situação é o contrato |

## Minhas calls (revise)

- **Finalidade vira uma só** (`venda` ou `aluguel`), como no site. Os dois imóveis do seed marcados
  «Venda e locação» (`im-101`, `im-105`) passam a `venda`; a locação deles não depende da finalidade.
  Se quiser anunciar o mesmo imóvel nas duas finalidades, é um segundo anúncio (o catálogo é assim).
- **Excluir:** dono, ou o corretor captador no imóvel dele; bloqueado se há locação ativa. Jurídico e
  recepção não excluem (coerente com «jurídico só arquiva»); para tirar do site, mudam o status para
  rascunho.
- **Seed:** os 5 imóveis existentes ganham preço, bairro, cidade e área de exemplo (Três Lagoas/MS).

## Fica para quem constrói

Layout do formulário (seções, ordem), máscara de CEP e preço, e o roteiro de QA no navegador.
