# APIs em uso — Painel Bradisfer

> Referência técnica: cada API que o projeto consome hoje, como autenticar, o que mandar, e o que ela devolve (campo a campo, com exemplo real). Para saber **de onde vem cada dado / quem atualiza / validade**, ver `LINHAGEM-DE-DADOS.md` — este arquivo é sobre as APIs em si, aquele é sobre o fluxo de dados.
>
> Última revisão: 31/08/2026.

## 1. API da Sysemp (ERP)

**Base URL**: `https://api.sysemp.com.br/163/<nome-do-metodo>`
**Método HTTP**: sempre `POST`, corpo `application/json`
**Autenticação**: header `Token: <valor>` (não é `Authorization: Bearer`). Token estático, sem endpoint de login/exchange — fornecido diretamente pela Sysemp por suporte. Guardado como secret `SYSEMP_TOKEN` (GitHub Actions) ou variável Secret (Cloudflare Worker).
**Documentação oficial**: nenhuma conhecida (Swagger/PDF) — tudo descoberto por tentativa e contato direto com o suporte Sysemp via WhatsApp.

### 1.1 `listaProdutosComEstoquePrecoVendaCusto`

Catálogo inteiro, paginado por `offset` (a Sysemp controla o tamanho de página, hoje ~100/página — tentativas de pedir 200/500 já deram `504 Gateway Time-out`, não mexer sem re-testar com cuidado).

**Corpo da chamada**:
```json
{ "offset": "0" }
```

**Resposta** (`resposta.retorno`, um item por produto):
```json
{
  "id_produto": "7018",
  "cod_barra": "0074468051034",
  "cod_fabrica": "008.001.001.002",
  "codigo_auxiliar": "6639",
  "descricao": "TINTA SPRAY 350ML/250G U.G.PRETO FOSCO - COLOR&COLA",
  "descricao_compra": "...",
  "descricao_fiscal": "...",
  "classificacao": "MERCADORIA PARA REVENDA",
  "id_marca": "187",
  "descricao_marca": "COLOR&COLA",
  "id_grupo": null,
  "descricao_grupo": null,
  "id_subgrupo": null,
  "descricao_subgrupo": null,
  "pesobruto": "0.0000",
  "pesoliquido": "0.0000",
  "unidade": "UND",
  "estoque_minimo": "849.0000",
  "estoque_maximo": "700.0000",
  "estoque": "300.0000",
  "preço_venda": "11.8450",
  "custo": "6.1847",
  "produto pai": null
}
```

**Quem chama**: `automacao-vendas/atualizar-estoque.js` (GitHub Actions, a cada 10 min) — busca todas as páginas em paralelo (`PAGINAS_EM_PARALELO=8`), grava na aba `Produtos`.

**Quirk conhecido**: `cod_barra` às vezes some o zero à esquerda **não** na API (confirmado 25/08/2026 que o valor bruto já vem certo) — o problema era o Google Sheets reformatando a coluna sozinho; ver `LINHAGEM-DE-DADOS.md` e o histórico em `CONTEXTO.md`.

### 1.2 `listarVendasMediaPorProduto`

Dois modos, pelo mesmo endpoint:

**Modo lote** (catálogo inteiro, sem `cod_barra` — implementado pela Sysemp em 20/08/2026 a pedido nosso):
```json
{ "cod_barra": "", "datainicial": "25/08/2025", "datafinal": "25/08/2026", "offset": "0" }
```
Resposta, um item por produto (campos **sem acento**, diferente do modo 1-produto):
```json
{
  "Codigo barras": "7897649768629",
  "Descricao produto": "CESTO LIXO 100L PLASTICO",
  "Média Mensal": "8.36",
  "Total vendido": "102.0000",
  "Data ultima venda": "2026-08-17",
  "Quantidade ultima venda": "3.0000"
}
```
Quem chama: `automacao-vendas/atualizar-vendas.js` (GitHub Actions, a cada 20 min) — busca em paralelo, grava na aba `VendasAoVivo`.

**Modo 1 produto** (`cod_barra` preenchido — usado no clique do modal):
```json
{ "cod_barra": "7897613529034", "datainicial": "25/08/2025", "datafinal": "25/08/2026", "offset": "0" }
```
Resposta (campos **com acento**, grafia diferente do modo lote):
```json
{
  "Codigo barras": "7897613529034",
  "Produto ID": "4818",
  "Descricao produto": "MISTURADOR DE TINTA FERRO SDS 120X10X600MM (12) COMPEL",
  "Média Mensal": "8.36",
  "Total vendido": "102.0000",
  "Data ultima venda": "2026-08-17",
  "Quantidade ultima venda": "3.0000"
}
```
Quem chama: `cloudflare-worker/produto-detalhe.js`, só como **fallback** quando o produto ainda não está no lote (`VendasAoVivo`) já carregado no navegador — na maioria dos cliques essa chamada nem acontece mais (ver `CONTEXTO.md`, fix de 25/08/2026).

**Quirk conhecido**: essa consulta é **lenta** (5-15s, às vezes mais) quando feita pra 1 produto com janela de 1 ano — confirmado ser processamento da própria Sysemp, não infraestrutura de transporte (testado com Apps Script e depois com Cloudflare Worker, tempo ficou parecido nos dois).

**Campos aceitam duas grafias** (com/sem acento, "Média Mensal" vs "Media Mensal", etc.) — o código sempre tenta as duas via uma função `campo(item, ...chaves)`, pra não quebrar se a Sysemp padronizar um dia.

### 1.3 `listarComprasPorProduto`

**Corpo**:
```json
{ "cod_barra": "7897613529034", "offset": "0" }
```

**Resposta**:
```json
{
  "status": true,
  "qtde": 1,
  "retorno": [{
    "Código de Barras": "7897613529034",
    "ID Produto": "4818",
    "Produto": "MISTURADOR DE TINTA FERRO SDS 120X10X600MM (12) COMPEL",
    "ultimas_compras": [
      {
        "Empresa": "BRADISFER DISTRIBUIDORA",
        "Número NF": 103513,
        "Fornecedor": "PINCEIS COMPEL INDUSTRIA E COMERCIO LTDA",
        "Id Empresa": 1,
        "Custo Unitário": 21.86,
        "Data da Compra": "2026-06-01",
        "Quantidade Comprada": 36
      }
    ]
  }]
}
```
Quem chama: `cloudflare-worker/produto-detalhe.js`, sempre (não tem equivalente em lote/planilha — é buscado ao vivo em todo clique no modal). Rápido (~0,36s medido em produção).

### 1.4 Endpoints pedidos, ainda não liberados

- **Inserir pedido de compra** (POST) — pedido formal enviado à Sysemp, sem resposta ainda. Ver texto do pedido no histórico da conversa / `pedido-apis-sysemp.pdf` gerado em 24/08/2026.
- **Consultar pedidos de compra em aberto** (GET/POST) — mesmo pedido, ainda sem resposta. Hoje esse controle é manual (usuário importa CSV exportado da Sysemp no próprio painel).
- **Sugestão Customizada de Compras** (tela nativa da Sysemp, Curva ABC/Cobertura/Sugestão prontos) — perguntado se existe API; resposta pendente.
- **Venda por vendedor/meta** — pedido enviado, cobriria a aba "Vendas" do painel (hoje com dados fictícios na seção de metas).

## 2. Google Sheets API (escrita)

**Biblioteca**: `googleapis` (Node.js), usada pelos scripts em `automacao-vendas/*.js`
**Autenticação**: conta de serviço `vendas-ao-vivo-github@bradisfer-automacao-vendas.iam.gserviceaccount.com` (projeto GCP `bradisfer-automacao-vendas`), chave guardada como secret `GOOGLE_SERVICE_ACCOUNT_KEY`, compartilhada como Editor na planilha.
**Planilha**: `Bradisfer_Painel_Estoque_v2`, ID `1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A`.

Operações usadas: `spreadsheets.values.clear`, `spreadsheets.values.update` (sempre `valueInputOption: 'RAW'`), `spreadsheets.get` (metadados), `spreadsheets.batchUpdate` (criar aba nova, no `relatorio-comparativo.js`).

**Quirk conhecido**: a coluna "Código Barras" precisa ser gravada com uma aspa simples como parte literal do valor (`'0074468051034`) — é a única forma que resiste a reformatação automática do Sheets pra número (perdendo zero à esquerda). Ver `CONTEXTO.md`, investigação de 25/08/2026.

## 3. Google Sheets — leitura pública (gviz CSV)

**URL**: `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<nome-da-aba>`
**Autenticação**: nenhuma — a planilha está compartilhada como "qualquer pessoa com o link". Ver lacuna de segurança em `LINHAGEM-DE-DADOS.md`.
**Quem chama**: `script.js`, direto do navegador, pras abas `BaseLooker`, `AnaliseMinMax`, `VendasAoVivo`.
**Quirk conhecido**: cache do lado do Google **imprevisível**, mesmo com cache-buster (`&t=<timestamp>`) na URL — não é confiável pra diagnóstico em tempo real; só serve pra uso normal do painel (onde alguns minutos de defasagem não importam).

## 4. Cloudflare Worker — `produto-detalhe.js`

**URL**: `https://rough-dust-49b2.bradisferdistribuuidora.workers.dev`
**Autenticação**: nenhuma exigida na entrada (é público), mas só responde com CORS liberado pra origem `https://es813636-dot.github.io` — outra origem recebe a resposta bloqueada pelo navegador. O token da Sysemp fica só no Worker (Secret), nunca chega no navegador do usuário.

**Chamada**:
```
GET /?codBarra=<codigo>&tipo=compras
GET /?codBarra=<codigo>&tipo=vendas
```

**Resposta** (formato uniforme, sucesso ou erro):
```json
{ "ok": true, "dados": { /* resposta bruta da Sysemp, ver 1.2/1.3 acima */ } }
```
```json
{ "ok": false, "erro": "mensagem" }
```

**Quem chama**: `script.js`, função `buscarComprasVendasReais()`, ao clicar num produto no painel. Substituiu o `doGet` do Apps Script em 25/08/2026 (ver `CONTEXTO.md`).

## 5. API da Anthropic (Claude) — aba "Atenção"

**Base URL**: `https://api.anthropic.com/v1/messages`
**Autenticação**: header `x-api-key: <chave>` + `anthropic-version: 2023-06-01`. Chave gerada em console.anthropic.com, guardada como Secret `ANTHROPIC_API_KEY` só no Cloudflare Worker — nunca chega no navegador.
**Modelo**: `claude-sonnet-5`.

**Quem chama**: o mesmo Cloudflare Worker (`cloudflare-worker/produto-detalhe.js`) que já fala com a Sysemp, numa rota nova via `POST` (as rotas antigas de compras/vendas continuam só em `GET`). `script.js` manda o corpo:
```json
{ "acao": "resumo", "contexto": { /* saída condensada de calcularAlertas(), ver montarContextoIA() */ } }
```
ou
```json
{ "acao": "chat", "contexto": {...}, "pergunta": "...", "historico": [{ "papel": "usuario", "texto": "..." }] }
```
e recebe de volta `{ "ok": true, "texto": "..." }` (mesmo formato uniforme das outras rotas do Worker).

**O que entrega**: só texto interpretando/priorizando os dados que `calcularAlertas()` já calculou — a IA nunca recalcula número nenhum, é sempre o motor de regras determinístico quem decide o que é CRÍTICO/ATENÇÃO. Usada em dois lugares na aba Atenção: resumo automático (dispara 1x por sessão ao abrir a aba, ou ao clicar "Atualizar análise") e chat livre (dispara 1x por pergunta enviada).

**Controle de custo**: `contexto` é sempre condensado (top 15 marcas + top 25 itens mais urgentes, não o catálogo inteiro) antes de sair do navegador — o tamanho (e custo) de cada chamada não escala com o tamanho do estoque. No chat, o Worker é stateless, então cada pergunta reenvia o `contexto` + o histórico da conversa guardado no navegador (`chatIAHistorico`) — o custo cresce com o tamanho da conversa, não do catálogo.

## 6. Google Identity Services (login)

**Script**: `https://accounts.google.com/gsi/client`
**Uso**: botão "Entrar com o Google" na tela de login do painel (`#login-overlay`). Client ID OAuth do projeto GCP `bradisfer-automacao-vendas`, restrito à origem `https://es813636-dot.github.io`.
**O que entrega**: um JWT (ID token) decodificado **só no navegador** (sem validar assinatura — não dá pra validar de verdade sem backend) pra extrair o e-mail e comparar contra `EMAILS_PERMITIDOS` em `script.js`.
**Limitação conhecida**: protege só a tela — ver "Camadas de acesso" em `LINHAGEM-DE-DADOS.md`.

## Resumo — quem chama o quê

| Script/página | APIs que chama |
|---|---|
| `automacao-vendas/atualizar-estoque.js` | Sysemp `listaProdutosComEstoquePrecoVendaCusto` + Google Sheets API (escrita) |
| `automacao-vendas/atualizar-vendas.js` | Sysemp `listarVendasMediaPorProduto` (modo lote) + Google Sheets API (escrita) |
| `automacao-vendas/relatorio-comparativo.js` | Sysemp `listaProdutosComEstoquePrecoVendaCusto` + `listarVendasMediaPorProduto` (modo lote, 2x — julho e agosto) + Google Sheets API (escrita) |
| `cloudflare-worker/produto-detalhe.js` | Sysemp `listarComprasPorProduto` + `listarVendasMediaPorProduto` (modo 1 produto) + Anthropic `/v1/messages` (rota POST, aba Atenção) |
| `script.js` (navegador) | Google Sheets gviz CSV (leitura, 3 abas) + Cloudflare Worker + Google Identity Services |
