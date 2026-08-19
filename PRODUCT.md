# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Pequena equipe de compras da Bradisfer — mais de uma pessoa acompanha estoque e rotina de compras. Uso 100% interno, não voltado a clientes externos.

## Product Purpose
Painel de estoque em tempo real que automatiza a decisão de reposição: sinaliza o que está zerado, abaixo do mínimo ou em excesso; calcula sugestão de quantidade de pedido; organiza a rotina semanal de compras por fornecedor; e gera o arquivo de pedido pronto pro Sysemp. Existe pra tirar do manual o trabalho de decidir o que comprar e quando.

## Positioning
O diferencial não é só mostrar os dados do Sysemp de um jeito mais rápido — é a camada de decisão pronta que o Sysemp sozinho não oferece: sugestão de pedido calculada (ponto de pedido, estoque de segurança, lead time por marca), rotina de compras por dia da semana/fornecedor, detecção de marcas com "compra urgente" (estoque vai zerar antes do próximo pedido chegar), e geração de pedido já no formato de importação do Sysemp.

## Operating Context
Pipeline: Sysemp (ERP) → Google Sheets (planilhas `BaseLooker`, `AnaliseMinMax` e `VendasAoVivo`) → este site estático, com atualização automática a cada poucos minutos. O detalhe de produto busca compras/vendas ao vivo direto na Sysemp via um Apps Script Web App, sob demanda (um produto por vez); a `VendasAoVivo` é alimentada em lote pelo mesmo Apps Script, cobrindo o catálogo inteiro. Hospedado no GitHub Pages; nada é publicado automaticamente, só um `git push` explícito. **Desde 19/08/2026, o projeto são 3 arquivos** — `index.html` (esqueleto HTML), `style.css` e `script.js` (extraídos do antigo arquivo único pra ficar mais fácil de navegar/diffar) — HTML/CSS/JS puro, sem build, sem dependências instaladas, só `<link>`/`<script src="">` estáticos. Fluxo de trabalho é editar → testar local com servidor estático (`file://` não funciona por causa do `fetch`) → checar sintaxe do JS → commit/push.

## Capabilities and Constraints
- **Preço de venda real disponível desde 2026-08-18**, importado de um export do Sysemp (tabela de preços, também tem margem líquida) e embutido no `index.html` (`TABELA_PRECOS`, casada por código de barras). Usado hoje só pra mostrar, por item, que % do valor total vendido da marca ele representa — não para lucro/margem (que não é exibida em lugar nenhum ainda, embora o dado esteja guardado). É uma foto estática do dia da exportação, não atualiza sozinha — precisa reexportar/colar manualmente, ou migrar pra uma aba na mesma planilha Google (como `BaseLooker`/`AnaliseMinMax`) pra ficar ao vivo. Fora isso, o resto do painel só tem custo de compra (`custo`); qualquer feature de "lucro"/"faturamento real" ainda depende de dado que não vem da Sysemp/planilha — estimativas (ex. "faturamento estimado") continuam sinalizadas como estimativa.
- A aba "Vendas" tem uma seção de visão BI (meta, vendedor, ticket médio, evolução por trimestre) com dados **fictícios**, claramente sinalizados na tela, esperando a API de vendas por vendedor da Sysemp ainda não disponível.
- **Sem autenticação/login hoje** — GitHub Pages público. Lacuna conhecida: idealmente teria alguma restrição de acesso; ainda não implementada.
- Sem framework/build — HTML/CSS/JS puro é uma escolha deliberada (deploy sem instalação, um único arquivo).

## Brand Commitments
Nome do produto: "Bradisfer — Painel de Estoque". Logo/marca Bradisfer usada no topo (imagem embutida). Idioma: português (pt-BR) em toda a interface.

## Evidence on Hand
Fonte de dados real: planilhas `BaseLooker`/`AnaliseMinMax`, API Sysemp ao vivo (compras/vendas por produto), e um export estático do Sysemp com preço de venda/margem líquida real por produto (`TABELA_PRECOS`, ver Capabilities and Constraints — hoje só o preço de venda é exibido, pra % de participação no faturamento da marca). Fora isso, não existe outro preço de venda/lucro real disponível — não inventar esse dado em nenhuma feature futura; qualquer estimativa precisa ficar claramente rotulada como tal.

## Product Principles
- Decisão de reposição é o centro do produto — toda feature nova deve facilitar "o que comprar, quando, de quem", não só exibir dado.
- Nunca inventar dado que não existe na fonte (lucro, margem, vendedor real); sinalizar com clareza quando algo é estimativa ou fictício.
- Zero fricção de deploy: continua um único arquivo HTML sem build, publicado só sob comando explícito do usuário.
- Uso interno por uma equipe pequena — não precisa escalar pra múltiplos clientes/tenants, mas precisa de controle de acesso (lacuna conhecida a resolver).

## Accessibility & Inclusion
O painel já recebeu uma passada de acessibilidade (navegação por teclado, trava de foco em modais, contraste ajustado pra WCAG AA, aria-labels, escape de HTML nos dados da planilha). Manter esse padrão em features novas: todo elemento clicável precisa ser operável por teclado, e dado vindo da planilha/API precisa ser escapado antes de virar HTML.
