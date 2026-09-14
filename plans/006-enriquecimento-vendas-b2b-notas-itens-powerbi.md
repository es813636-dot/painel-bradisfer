# 006 - Enriquecimento das vendas B2B e Online com notas e itens no Power BI

- **Status**: PROPOSTO
- **Fonte principal**: `listaPedidosNotasSaida`
- **B2B**: Bradisfer Distribuidora e Construbrag; canais APLICATIVO, MOBWIT, SITE e VENDAS INTERNA
- **Online**: Construbrag e SS Construcasa; canais que contenham SHOPEE, TIKTOK ou MERCADO LIVRE
- **Exclusão comercial**: vendedor ID `1604` (Marcus Vinicius Nunes de Matos)

## Objetivo

Substituir a fonte agregada `listarVendasPorVendedor` por uma fonte fiscal que reproduza o total do SYSEMP e traga os itens de cada nota. A mesma leitura da API será classificada em B2B e Marketplace, permitindo enriquecer também a página Canais Online. O resultado deve manter as análises atuais de vendedor, cliente, marca, canal, data e cidade e acrescentar produto, grupo, categoria, CFOP, custo e margem.

## Decisões de modelagem

O total de uma nota não pode ser repetido em todas as linhas de item. A planilha terá duas abas relacionadas por `EmpresaId + IdNota`:

### `VendasB2B_Notas`

Uma linha por nota fiscal:

| Campo | Uso |
|---|---|
| EmpresaId, Empresa | Identificação da empresa |
| IdNota, NumeroNF, Serie, ChaveNFe | Identificação fiscal e deduplicação |
| IdPedido, PedidoMarketplace | Contagem e rastreamento do pedido |
| DataPedido, DataEmissao, HoraPedido | Análises de período e operação |
| IdVendedor, Vendedor | Desempenho comercial |
| IdCliente, Cliente, Cidade, UF | Carteira e geografia |
| Canal | Segmentação B2B |
| CFOP, NaturezaOperacao | Classificação fiscal |
| TotalProdutos, TotalNota, TotalGeral | Valores da nota |
| Frete, Servicos, CustoTotal | Composição financeira e margem |
| AjusteFiscal | `TotalGeral - soma dos itens líquidos` |
| Status, NotaCancelada | Controle de validade |
| ChaveNota | `EmpresaId + IdNota` |
| AtualizadoEm | Auditoria da carga |

### `VendasB2B_Itens`

Uma linha por nota e produto, agregando repetições do mesmo produto na mesma nota:

| Campo | Uso |
|---|---|
| EmpresaId, IdNota, IdPedido, PedidoMarketplace | Relacionamento com a nota e o pedido do canal |
| DataEmissao | Filtro direto e conferência |
| IdVendedor, Vendedor | Análise do mix por vendedor |
| IdCliente, Cliente | Análise do mix por cliente |
| Canal, Cidade, UF | Segmentações atuais |
| IdProduto, Produto | Novo detalhe de produto |
| Marca, Grupo, Categoria | Hierarquia comercial |
| Quantidade | Itens vendidos |
| ValorUnitario | Preço praticado |
| ValorLiquidoItem | Receita líquida do produto |
| CustoUnitario, CustoTotalItem | Margem por produto |
| ChaveItem | `EmpresaId + IdNota + IdProduto` |
| AtualizadoEm | Auditoria da carga |

`SEM VENDEDOR` entra nos totais e fica fora de ranking e meta. O Marcus é removido pelo ID 1604 nas duas abas. A exclusão nunca deve depender do nome.

### `VendasOnline_Itens`

Uma linha consolidada por data, empresa, canal, CFOP e produto para os canais de Marketplace. A exclusão do ID 1604 é uma regra exclusiva do B2B. `AjusteFiscalAlocado` distribui em centavos a diferença entre o total fiscal e os itens, e `ValorFaturado` é a soma de `ValorLiquidoItem` com esse ajuste. Assim, a página online pode somar diretamente `ValorFaturado` sem duplicar o total da nota.

### `VendasOnline_Resumo`

Uma linha por data, empresa e canal, com número de vendas, faturamento fiscal, receita dos itens, ajuste fiscal, custo e ticket médio. Essa é a fonte aditiva dos cartões e da evolução temporal da página Canais Online.

Não será criada uma segunda aba online com uma linha para cada nota. Na simulação de 14/09/2026, a API retornou 215.139 notas e 219.764 linhas de itens, consolidadas em 908 linhas de resumo e 44.287 linhas de produto. As novas tabelas completas ocuparão cerca de 2,48 milhões de células, incluindo o detalhe B2B. A carga confere a projeção total antes de qualquer escrita e aborta acima de 9,5 milhões de células.

A planilha existente já ocupa aproximadamente 8,4 milhões de células. A primeira tentativa segura projetou 10.879.286 células com B2B e Online juntos e foi interrompida antes de gravar. A implantação inicial, portanto, ativa somente `VendasOnline_Resumo`, `VendasOnline_Itens` e `ConciliacaoOnline`. As tabelas B2B permanecem implementadas e testadas, mas precisam de outra planilha ou da substituição da fonte antiga para liberar espaço.

## Automação

1. Fazer uma carga histórica única de 02/01/2026 até a data atual, dividida por dia.
2. Em cada execução normal, reprocessar os últimos sete dias.
3. Buscar Bradisfer, Construbrag e SS Construcasa em paralelo controlado, com no máximo oito dias simultâneos.
4. Classificar cada nota como B2B ou Online usando empresa e canal; aplicar tipo de documento e cancelamento antes de preparar as linhas.
5. Substituir a janela reprocessada nas abas correspondentes. Não fazer somente append.
6. Deduplicar pelas chaves estáveis de nota e item.
7. Validar antes da escrita:
   - soma de `TotalGeral` igual à fonte fiscal até R$ 0,01;
   - nenhuma chave duplicada;
   - soma dos itens por nota mais `AjusteFiscal` igual ao total geral;
   - nenhuma linha do vendedor ID 1604 no B2B;
   - notas sem vendedor classificadas como `SEM VENDEDOR`.
8. Se uma validação falhar, não alterar a planilha e registrar o erro.
9. Manter backup da janela substituída até a conferência posterior à gravação.

Cadência proposta: atualização a cada hora, com reconciliação do mês atual e do mês anterior uma vez por semana.

## Aba de controle `ConciliacaoB2B`

Uma linha por execução:

- início e fim da janela;
- total fiscal recebido;
- total gravado em notas;
- total dos itens;
- ajuste fiscal;
- quantidade de notas;
- quantidade de itens;
- notas sem vendedor e seu valor;
- notas excluídas do vendedor 1604 e seu valor;
- duplicidades encontradas;
- diferença final;
- duração e status da carga.

`ConciliacaoOnline` registra os mesmos indicadores para Marketplace, sem a exclusão do vendedor 1604.

## Modelo Power BI

Criar duas tabelas fato:

- `Fact_NotasB2B`, carregada de `VendasB2B_Notas`, para faturamento, número de vendas, ticket médio, custo e margem.
- `Fact_ItensB2B`, carregada de `VendasB2B_Itens`, para quantidade, produto, marca, grupo, categoria e mix.
- `Fact_OnlineResumo`, carregada de `VendasOnline_Resumo`, para vendas, faturamento, ticket, custo e evolução por canal.
- `Fact_ItensOnline`, carregada de `VendasOnline_Itens`, para quantidade, produto, marca, grupo, categoria, custo e margem dos Marketplaces.

Dimensões compartilhadas: Data, Vendedor, Cliente, Empresa, Canal, Produto, Marca, Grupo, Categoria, Cidade/UF e CFOP. Os relacionamentos devem ser de uma dimensão para cada fato, sem ligar diretamente uma fato à outra.

As colunas `Produto` e `Grupo` da `Fact_Vendas` atual são placeholders nulos. Elas deixam de ser placeholders quando `Fact_ItensB2B` entrar no modelo.

## Medidas novas

### Financeiras

- Faturamento Fiscal
- Receita Líquida de Produtos
- Custo Total
- Margem Bruta
- Margem Bruta (%)
- Ajuste Fiscal
- Frete Médio

### Vendedor

- Faturamento por Vendedor
- Margem por Vendedor
- Ticket Médio por Vendedor
- Itens por Pedido
- Produtos Distintos Vendidos
- Marcas Distintas Vendidas
- Clientes Ativos
- Clientes Novos
- Clientes Reativados
- Participação no Faturamento (%)
- Dependência dos 5 Maiores Clientes (%)
- Meta, Gap e Projeção de Fechamento

### Produto e mix

- Quantidade Vendida
- Receita por Produto
- Margem por Produto
- Preço Médio Praticado
- Mix de Produtos por Pedido
- Participação de Marca (%)
- Concentração do Faturamento por Marca

## Plano das páginas

### 1. Visão Geral

Manter a estrutura atual e substituir os cartões por Faturamento Fiscal, Nº de Vendas, Ticket Médio, Margem Bruta e Itens Vendidos. Acrescentar variação contra mês anterior e indicador de vendas sem vendedor.

### 2. Vendedores

Esta continua sendo a página principal:

- tabela de ranking com faturamento, meta, percentual atingido, margem, ticket, clientes ativos e mix;
- gráfico de evolução mensal por vendedor;
- dispersão Faturamento x Margem, com tamanho pelo número de clientes;
- gráfico de meta realizada e projeção de fechamento;
- participação dos cinco maiores clientes de cada vendedor;
- detalhamento expansível Vendedor > Marca > Produto.

`SEM VENDEDOR` aparece em um cartão de qualidade de cadastro, não no ranking comercial.

### 3. Produtos e Mix

Nova página:

- produtos e marcas mais vendidos por vendedor;
- faturamento, quantidade, preço médio, custo e margem;
- produtos vendidos abaixo da margem mínima;
- vendedores que trabalham ou não cada marca;
- comparação do mix atual contra o mês anterior.

### Canais Online

Manter os indicadores atuais e passar a usar `Fact_OnlineResumo` nos cartões e na evolução temporal. Usar `Fact_ItensOnline` para detalhar canal, empresa, produto, marca, quantidade, custo e margem. A receita de produto deve usar `ValorFaturado`, que fecha com o total fiscal.

### 4. Clientes

Manter RFM e acrescentar produtos comprados, marcas compradas, margem, frequência, intervalo médio, cliente novo/reativado e concentração por vendedor.

### 5. Cidades

Acrescentar quantidade de pedidos, ticket, margem, mix de produtos e vendedores responsáveis por cidade/UF.

### 6. Conciliação

Página administrativa, podendo ficar oculta para apresentação:

- total fiscal x total carregado;
- valor sem vendedor;
- ajustes fiscais;
- notas canceladas;
- última atualização;
- divergências por empresa, canal, CFOP e data.

## Ordem de execução

### Fase 1 - Fonte e planilha

- criar as seis abas novas: notas e itens B2B, resumo e itens Online e duas conciliações;
- implementar carga histórica e incremental;
- manter `VendasBradisfer` atual intacta;
- conferir o histórico contra o SYSEMP.

### Fase 2 - Modelo paralelo

- adicionar as quatro novas fatos ao PBIP;
- criar dimensões de Produto, Grupo, Categoria e CFOP;
- criar e validar medidas novas;
- comparar todos os indicadores atuais com o modelo antigo.

### Fase 3 - Páginas

- migrar Visão Geral e Vendedores;
- criar Produtos e Mix;
- enriquecer Clientes e Cidades;
- criar Conciliação.

### Fase 4 - Troca da fonte

- atualizar o Power BI com os dois modelos em paralelo;
- aprovar totais, metas, ranking, clientes e datas;
- trocar os visuais para as novas medidas;
- manter a fonte antiga por sete dias como rollback;
- remover a fonte antiga após o período de estabilidade.

## Critérios de aceite

- Total fiscal igual ao SYSEMP até R$ 0,01 em qualquer período validado.
- Zero venda B2B do vendedor ID 1604.
- Marketplace preservado nas empresas Construbrag e SS Construcasa e separado do B2B.
- Vendas sem vendedor presentes nos totais e separadas do ranking.
- Zero chave duplicada de nota ou item.
- Nº de Vendas contado por `EmpresaId + IdNota`.
- Quantidade e receita de itens conciliadas por nota.
- Filtros de data terminando na última nota válida.
- Metas por vendedor e marca preservadas.
- Atualização incremental concluída sem intervenção manual.
