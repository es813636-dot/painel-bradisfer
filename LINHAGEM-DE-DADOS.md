# Linhagem de Dados — Painel Bradisfer

> Documento de governança. Objetivo: qualquer pessoa (inclusive uma versão futura de mim) consegue olhar aqui e saber **de onde vem cada dado, quem é responsável por atualizá-lo, e qual a validade dele** — sem precisar reconstruir a investigação do zero, como aconteceu com o bug do código de barras em 25/08/2026 (a aba `Base` intermediária só foi descoberta durante aquela depuração).
>
> Última revisão: 25/08/2026 (migração do doGet pro Cloudflare Worker). Atualizar este arquivo sempre que uma fonte de dados, aba ou script mudar de lugar/comportamento — é uma falha de governança deixar esse documento ficar desatualizado silenciosamente, o mesmo problema que ele existe pra evitar.

## Visão geral do fluxo

```mermaid
flowchart LR
    SYS[("Sysemp (ERP)")]
    PROD[Produtos]
    BASE[Base]
    BL[BaseLooker]
    AMM[AnaliseMinMax]
    VAV[VendasAoVivo]
    PAINEL[Painel]
    REL["Relatorio Comparativo"]
    JS["script.js (navegador)"]
    CFW["Cloudflare Worker\n(produto-detalhe.js)"]

    SYS -- "listaProdutosComEstoquePrecoVendaCusto\n(a cada 10 min, GitHub Actions)" --> PROD
    PROD -- "formula =SE(...)" --> BASE
    BASE -- "formula ={Base!A2:O5502}" --> BL
    SYS -- "listarVendasMediaPorProduto\n(a cada 20 min, GitHub Actions)" --> VAV
    SYS -. "1 produto por vez, sob demanda\n(clique no modal)" .-> CFW
    CFW -. resposta direta, nao passa pela planilha .-> JS
    BL -- "CSV publico (gviz)" --> JS
    AMM -- "CSV publico (gviz)\nfonte estatica, import unico" --> JS
    VAV -- "CSV publico (gviz)" --> JS
    SYS -. "manual, sob demanda\n(script pontual)" .-> REL
    PROD -.->|"nao usada por script.js\nproposito nao mapeado"| PAINEL
```

## Fontes primárias (Sysemp)

| Endpoint | Consumido por | Frequência | O que traz |
|---|---|---|---|
| `listaProdutosComEstoquePrecoVendaCusto` | `automacao-vendas/atualizar-estoque.js` (GitHub Actions) | A cada 10 min (5h–23h59 e 0h–2h Brasília) | Catálogo inteiro: estoque, mín/máx, custo, preço de venda, código de barras |
| `listarVendasMediaPorProduto` (sem `cod_barra`) | `automacao-vendas/atualizar-vendas.js` (GitHub Actions) | A cada 20 min (mesma janela) | Catálogo inteiro: média mensal e total vendido (12 meses), por produto |
| `listarComprasPorProduto` / `listarVendasMediaPorProduto` (1 produto) | **Cloudflare Worker** `cloudflare-worker/produto-detalhe.js` (`rough-dust-49b2.bradisferdistribuuidora.workers.dev`) | Sob demanda, a cada clique no modal de produto | Últimas compras e venda AO VIVO de 1 produto só |
| (endpoint de venda por vendedor/meta) | — não implementado | — | Pedido enviado à Sysemp, resposta pendente — ver `CONTEXTO.md` |

**Autenticação**: header `Token` (não `Authorization: Bearer`), enviado em toda chamada. Token guardado como secret `SYSEMP_TOKEN` no GitHub (para as automações) e como Secret nas variáveis do Cloudflare Worker (para o clique individual). Sem endpoint de login separado — é um valor estático fornecido pela Sysemp.

**Nota de performance (25/08/2026)**: migrar do Apps Script `doGet` pro Worker deixou a busca de "compras" ~8x mais rápida (2,9s → 0,36s, eliminando o redirecionamento interno do Google). A busca de "vendas" continuou parecida (5–15s) — o gargalo é a própria Sysemp calculando 1 ano de histórico por produto, não infraestrutura de transporte; não dá pra resolver trocando de servidor de novo.

## Planilha Google (`Bradisfer_Painel_Estoque_v2`, ID `1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A`)

| Aba | Como é preenchida | Dono / atualizador | Validade | Consumida por |
|---|---|---|---|---|
| **Produtos** | Escrita direta (`values.clear` + `values.update`, RAW) por `atualizar-estoque.js` | Automação (GitHub Actions) | Sempre fresca (~10 min) | Aba `Base` (fórmula) **e, desde 01/09/2026, também `script.js` diretamente** (só pra `Código Interno`/`Código Fabricante`/`Código Auxiliar` — ver nota abaixo) |
| **Base** | Fórmula `=SE(Produtos!Bxxxx="";"";Produtos!Bxxxx)` célula a célula, referenciando `Produtos` | Ninguém edita manualmente — nota na própria aba: *"BASE — calculada automaticamente a partir da aba Produtos. Não editar manualmente."* | Reflete `Produtos` quase em tempo real (recálculo de fórmula do Sheets) | Aba `BaseLooker` (fórmula) |
| **BaseLooker** | Fórmula `={Base!A2:O5502}` (array, espelha `Base` inteira) | Idem — não editar manualmente | Idem `Base` | **`script.js`** (fonte principal do painel, via CSV público) |
| **AnaliseMinMax** | Import manual único (Excel → Sheets), feito uma vez | Ninguém — **congelada desde a importação original** (~meados de agosto/2026) | ⚠️ **Estática, não atualiza sozinha.** Só fallback pra produtos ainda não cobertos por `VendasAoVivo` | `script.js` (fallback + Curva ABC/Nível de Atendimento informativos) |
| **VendasAoVivo** | Escrita direta por `atualizar-vendas.js` (upsert por código de barras) | Automação (GitHub Actions) | Fresca (~20 min) | `script.js` (fonte principal de sugestão de compra) |
| **Relatorio Comparativo** | Escrita direta por `automacao-vendas/relatorio-comparativo.js` | Manual — só quando alguém dispara o workflow `Relatorio Comparativo (Julho x Agosto)` | Só reflete o momento em que foi gerado, não atualiza sozinha | Ninguém automaticamente — leitura manual na planilha |
| **Painel** | ⚠️ **Não mapeado.** Existe na planilha (visível na lista de abas), mas nenhum script deste repositório (nem `script.js`, nem as automações) lê ou escreve nela | Desconhecido | Desconhecido | Desconhecido — **investigar antes de assumir que está em uso ou que pode ser removida** |
| **VendasOnline** | Escrita direta (`values.clear` + `values.update`, RAW, aba inteira sobrescrita a cada rodada) por `atualizar-vendas-online.js` — aba criada automaticamente pelo script na 1ª execução, se ainda não existir | Automação (GitHub Actions, mensal) | Reflete o mês fechado anterior à última rodada (não atualiza sozinha entre rodadas) | **Nenhum consumidor no painel HTML.** Alimenta um **Power BI separado** (vendas de marketplace — Shopee, TikTok — das empresas CONSTRUBRAG e SS CONSTRUCASA); `script.js` nunca lê essa aba |

### Nota sobre a coluna "Código Barras"

Grava com uma aspa simples como parte literal do conteúdo (`'0074468051034`), não como dica de formatação — é a única forma que resistiu a reformatação automática do Google Sheets (ver `CONTEXTO.md`, investigação de 25/08/2026). `script.js` remove essa aspa ao ler (`limparCodigoBarras()`). Qualquer novo lugar que grave ou leia essa coluna precisa seguir o mesmo padrão, senão o cruzamento entre `Produtos`/`VendasAoVivo` quebra silenciosamente.

### Nota sobre `script.js` ler `Produtos` direto (01/09/2026)

Até 01/09/2026, `script.js` só lia `BaseLooker`/`AnaliseMinMax`/`VendasAoVivo` — nunca `Produtos` direto. Passou a buscar `Produtos` também, só pra 3 campos que a `BaseLooker` não carrega (`Código Interno`, `Código Fabricante`, `Código Auxiliar`, usados pra cruzar cotação de fornecedor com o catálogo). **Decisão deliberada de não estender `Base`/`BaseLooker`** — essas duas têm fórmulas fixas em 5500 linhas que ninguém edita mais e ninguém consegue inspecionar/testar ao vivo com segurança (ver lacunas conhecidas abaixo); buscar `Produtos` à parte e casar por código de barras no navegador evitou esse risco.

- **`Código Interno` tem que ser lido por posição, não por nome** — a célula de cabeçalho dessa coluna na planilha tem uma anotação antiga colada no mesmo texto ("COLE AQUI o CSV... Código Interno", tudo numa célula só), então `r['Código Interno']` sempre vem vazio; `script.js` lê `Object.values(r)[0]` (1ª coluna) em vez do nome. Confirmado direto no CSV público antes de escrever o código, não é suposição.
- **`Código Auxiliar` foi adicionado na automação (`atualizar-estoque.js`) mas ainda não tem dado** — precisa de duas coisas pra popular: (1) a automação rodar de novo com o mapeamento novo (~10 min depois do deploy), e (2) alguém digitar `Código Auxiliar` na célula de cabeçalho correspondente na planilha (hoje está em branco, na coluna logo depois de "Preço") — sem esse cabeçalho, o valor chega na planilha mas o painel não sabe em qual coluna procurar.

## Dados embutidos no código (fora da planilha)

| O quê | Onde | Origem | Validade |
|---|---|---|---|
| `TABELA_PRECOS` | `script.js` (constante grande, embutida no código-fonte) | Export manual da Sysemp ("manutenção da tabela de preços"), colado no código em 18/08/2026 | ⚠️ **Foto estática do dia da exportação.** Preço/margem mudam com reajuste e isso não atualiza sozinho. Ideal: migrar pra uma aba própria da planilha (mesmo padrão de `VendasAoVivo`), ainda não feito |

## Camadas de acesso e proteção

| Camada | Protegida? | Como |
|---|---|---|
| Tela do painel (GitHub Pages) | ✅ Sim | Login Google restrito por e-mail (`EMAILS_PERMITIDOS` em `script.js`), implementado 25/08/2026 — "Nível A" |
| CSV público das abas `BaseLooker`/`AnaliseMinMax`/`VendasAoVivo` | ❌ Não | Continuam com compartilhamento "qualquer pessoa com o link" — quem souber a URL do `gviz` acessa direto, sem passar pelo login. Corrigir isso exigiria "Nível B" (mover a hospedagem do painel pro Apps Script/backend próprio e servir os dados só depois de validar login) — não implementado |
| Secrets (`SYSEMP_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY`) | ✅ Sim | Guardados como GitHub Actions secrets; nunca aparecem em código versionado |

## Donos por área (pra saber a quem perguntar)

| Área | Responsável hoje |
|---|---|
| Token/acesso à API Sysemp | Usuário (contato direto com suporte Sysemp via WhatsApp) |
| Planilha Google (estrutura das abas, fórmulas) | Usuário — criada originalmente a partir de um `.xlsx` importado, mantida à mão nas partes não automatizadas (`Base`, `BaseLooker`, `AnaliseMinMax`) |
| Automações (GitHub Actions, `automacao-vendas/*.js`) | Código no repositório, sem dono humano designado além de quem tem acesso ao repo |
| Lista de e-mails autorizados no painel | Usuário (`EMAILS_PERMITIDOS` em `script.js`) |
| Cloudflare Worker (`produto-detalhe.js`) | Conta Cloudflare do usuário (`bradisferdistribuuidora`) — código versionado em `cloudflare-worker/produto-detalhe.js`, mas o deploy em si é manual (colar no editor do dashboard), não automatizado por CI |

## Lacunas conhecidas (não resolvidas ainda)

1. **Aba "Painel" não mapeada** — precisa investigar o que é antes de mexer em qualquer coisa perto dela.
2. **`TABELA_PRECOS` congelada** desde 18/08/2026, embutida no código em vez de numa aba viva.
3. **`AnaliseMinMax` congelada** desde a importação original — só fallback, mas ainda influencia Curva ABC/Nível de Atendimento exibidos.
4. **CSV público sem proteção real** — só a tela do painel tem login, os dados brutos continuam acessíveis por quem souber a URL.
5. **Apps Script "Estoque" 100% desativado, mas ainda existe** — desde 25/08/2026 (migração do `doGet` pro Cloudflare Worker), nenhuma parte do Apps Script está mais em uso pelo painel: `atualizarEstoque`/`atualizarVendasAoVivo` já tinham os gatilhos removidos antes, e agora o `doGet` também não é mais chamado por `script.js`. O projeto e o código continuam existindo no Apps Script (não foi excluído), só não roda mais nada. Considerar excluir a implantação Web App lá (Gerenciar implantações → Arquivar) pra deixar claro que está desativado, ou pelo menos anotar isso no próprio arquivo do projeto.
