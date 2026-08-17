# Contexto do projeto — Painel de Estoque Bradisfer

## Links
- **Repositório:** https://github.com/es813636-dot/painel-bradisfer
- **Painel ao vivo:** https://es813636-dot.github.io/painel-bradisfer/
- **Fonte de dados:** Google Sheets (planilha `BaseLooker` + `AnaliseMinMax`), publicado como CSV, ID `1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A`
- **Proposta de direções BI (Power BI):** https://claude.ai/code/artifact/b7276579-517f-48d5-a61f-e5833ee35588

## Como continuar em outro computador
1. Instalar [Git](https://git-scm.com/) e (opcional) [VS Code](https://code.visualstudio.com/).
2. `git clone https://github.com/es813636-dot/painel-bradisfer.git`
3. Isso já traz o `index.html` completo — é o único arquivo do projeto, tudo em HTML/CSS/JS puro (nenhuma instalação de dependência necessária).
4. Fluxo de trabalho: editar `index.html` → testar localmente → `git add`, `git commit`, `git push` → GitHub Pages publica sozinho em ~1 min.

## O que já foi construído
- Painel de estoque em tempo real (Sysemp → Google Sheets → HTML), com KPIs, gráficos (Chart.js), busca por grupo/marca/produto/situação, rotina de compras semanal, marcas com compra urgente, geração de pedido (CSV pro Sysemp), importação de pedidos em aberto, detalhe de produto com dados ao vivo da Sysemp (via Apps Script).
- Aba "Vendas" com visão estilo BI: produtos/marcas mais vendidos, relatório por marca, e uma seção de "visão geral" com cartões de gradiente — **atenção:** meta, vendedor, ticket médio e evolução por trimestre nessa seção são **dados fictícios**, claramente sinalizados na tela, esperando a API de vendas por vendedor da Sysemp.
- Acessibilidade: navegação por teclado, escape de HTML nos dados da planilha (proteção contra dado malicioso/quebrado), trava de foco em modal.

## Pendências conhecidas
- **Revisar a conversão de Lead Time → meses** em `calcularSugestaoSemPlanilha` (usa `/30`, confirmado correto com prints reais do Sysemp — mês fixo de 30 dias, não 365/12). Já está certo, só not deixando registrado que foi validado.
- **Pedir à Sysemp o endpoint de vendas por vendedor/meta** — assim que existir, trocar os dados fictícios da aba Vendas pelos reais (a estrutura visual já está pronta pra isso).
- **Escolher uma das 4 direções de Power BI** propostas (link acima) se quiser seguir esse caminho — requer Power BI Desktop, que eu não consigo operar remotamente.

## Convenções do projeto
- Paleta de status validada contra daltonismo/contraste (skill `dataviz`): RUPTURA `#e66767`, BAIXO `#199e70`, EXCESSO `#3987e5`, OK `#008300`.
- Gráficos usam Chart.js — o `<canvas>` é sempre preservado entre renderizações (nunca destruído/recriado à toa), senão a animação não tem "de onde" partir.
- Animação dos gráficos só liga em clique real do usuário (chip/card/legenda/barra), nunca em toda renderização — evita travar em 0 quando a aba está em segundo plano.
