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
Pipeline: Sysemp (ERP) → Google Sheets (planilhas `BaseLooker` e `AnaliseMinMax`) → este HTML estático, com atualização automática a cada poucos minutos. O detalhe de produto busca compras/vendas ao vivo direto na Sysemp via um Apps Script Web App, sob demanda (um produto por vez). Hospedado no GitHub Pages; nada é publicado automaticamente, só um `git push` explícito. O projeto inteiro é um único arquivo `index.html` (HTML/CSS/JS puro, sem build, sem dependências instaladas) — fluxo de trabalho é editar → testar local com servidor estático (`file://` não funciona por causa do `fetch`) → commit/push.

## Capabilities and Constraints
- **Sem preço de venda no painel** — só custo de compra (`custo`) existe nos dados. Qualquer feature de "lucro", "margem" ou "faturamento real" depende desse dado, que ainda não vem da Sysemp/planilha; estimativas já existentes (ex. "faturamento estimado") são sinalizadas explicitamente como estimativa.
- A aba "Vendas" tem uma seção de visão BI (meta, vendedor, ticket médio, evolução por trimestre) com dados **fictícios**, claramente sinalizados na tela, esperando a API de vendas por vendedor da Sysemp ainda não disponível.
- **Sem autenticação/login hoje** — GitHub Pages público. Lacuna conhecida: idealmente teria alguma restrição de acesso; ainda não implementada.
- Sem framework/build — HTML/CSS/JS puro é uma escolha deliberada (deploy sem instalação, um único arquivo).

## Brand Commitments
Nome do produto: "Bradisfer — Painel de Estoque". Logo/marca Bradisfer usada no topo (imagem embutida). Idioma: português (pt-BR) em toda a interface.

## Evidence on Hand
Fonte de dados real: planilhas `BaseLooker`/`AnaliseMinMax` e API Sysemp ao vivo (compras/vendas por produto). Não existe preço de venda/lucro real disponível — não inventar esse dado em nenhuma feature futura; qualquer estimativa precisa ficar claramente rotulada como tal.

## Product Principles
- Decisão de reposição é o centro do produto — toda feature nova deve facilitar "o que comprar, quando, de quem", não só exibir dado.
- Nunca inventar dado que não existe na fonte (lucro, margem, vendedor real); sinalizar com clareza quando algo é estimativa ou fictício.
- Zero fricção de deploy: continua um único arquivo HTML sem build, publicado só sob comando explícito do usuário.
- Uso interno por uma equipe pequena — não precisa escalar pra múltiplos clientes/tenants, mas precisa de controle de acesso (lacuna conhecida a resolver).

## Accessibility & Inclusion
O painel já recebeu uma passada de acessibilidade (navegação por teclado, trava de foco em modais, contraste ajustado pra WCAG AA, aria-labels, escape de HTML nos dados da planilha). Manter esse padrão em features novas: todo elemento clicável precisa ser operável por teclado, e dado vindo da planilha/API precisa ser escapado antes de virar HTML.
