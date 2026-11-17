# Painel de gestão — telas restantes, todas em mock

Continuação de `2026-11-15-painel-gestao-design.md` e `2026-11-16-gestao-locacao-design.md`.

## Motivo

A Olmi valida as telas conforme elas são entregues. Decisão de 17/11: terminar **todas** as telas em
mock (localStorage + seed + `mocker-nuxt`) antes de começar o backend real e as integrações (Asaas,
SPC/Serasa, Turnstile, e-mail). Cada tela já nasce com o formato que o servidor vai assumir: regra em
módulo puro de `layers/gestao/domain`, testada em Node.

## Ordem e escopo

| # | Tela | Escopo em mock |
|---|---|---|
| 1 | Avisos da locação | Fim de contrato (90/60/30 dias) e aluguel a vencer ou em atraso; selo no card e lista na locação |
| 2 | Financeiro | Comissões das vendas + cobranças e repasses das locações, por competência (o filtro vale só para as locações); só `valores` |
| 3 | Dashboard | Contadores, contratos parados e avisos, sobre os dados dos itens 1 e 2 |
| 4 | Histórico de alterações | Tela geral sobre o `hist` de vendas e locações, filtro por quem e quando; só `auditoria` |
| 5 | Usuários e permissões | Editar a matriz de permissões por perfil (a de convites já existe) |
| 6 | Configurações | Dados da imobiliária e parâmetros padrão (% de comissão, taxa da locação); só `admin` |
| 7 | Consulta cadastral | Formulário e resultado simulado de SPC/Serasa; só `consulta` |
| 8 | Imóveis | **Feito (18/11):** espelho do catálogo em mock, com cadastro completo, status, fotos e permissão por corretor; o CRUD real do `/admin` entra na fase de backend. Ver `2026-11-17-gestao-imoveis-espelho-design.md` |

## Fora do escopo por decisão

- Qualquer migration, endpoint real, RLS, Storage, e-mail ou WhatsApp.
- Job diário de avisos: aqui os avisos são calculados na tela a partir de `hoje`.
- Consulta real a SPC/Serasa e cobrança real (Asaas).

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Avisos calculados por função pura com `hoje` por parâmetro (`avisos-locacao.ts`) | Campo «aviso» gravado na locação | Dado derivado envelhece; o job diário do backend chama a mesma função |
| Texto do aviso nunca cita R$ | Mostrar o valor do aluguel em atraso | A recepção não tem `valores` e precisa saber que venceu, não quanto |
| Seed da locação ativa ancorado em `hoje` (fim em +45 dias, aluguel vencido há 3) | Datas fixas no seed | Datas fixas envelhecem e a reunião abriria sem aviso nenhum; testes fixam a data do seed |
| Chave do localStorage sobe para `gestao-demo-v4` | Manter `v3` | O estado guardado traria as datas antigas e esconderia os avisos |
| Aluguel avisa a 5 dias do vencimento | Avisar no mês todo | Evita ruído; o valor é uma constante (`ANTECEDENCIA_ALUGUEL`) fácil de mudar |
