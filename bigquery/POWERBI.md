# Power BI no BigQuery

O script `migrate-powerbi.ps1` troca apenas as particoes Power Query destas tabelas, mantendo nomes, lineage tags, medidas, relacionamentos e visuais:

- `Fact_Vendas`
- `Dim_Cliente`
- `Dim_Data`
- `Fact_VendasOnline`
- `Fact_OnlineResumo`
- `Fact_ItensOnline`

As tabelas manuais `Dim_Vendedor`, `Dim_Carteira`, `Meta_Marca` e `Clientes_Revisao_Manual` continuam no Google Sheets. `Meta_Vendedor` continua embutida no modelo. A fonte BigQuery usa o projeto de faturamento `bradisfer-bi` e desativa a Storage API porque a identidade de leitura possui permissoes minimas.

Com o Power BI Desktop fechado:

```powershell
& .\migrate-powerbi.ps1 -ProjectPath 'C:\Users\Admin\Documents\Dados BI'
```

O script cria uma pasta `.backup-pre-bigquery-<data-hora>` dentro do projeto antes de escrever. Ao abrir `BI.pbip`, o Power BI solicita a credencial do Google BigQuery na primeira vez. Para a conta de servico, use o e-mail de `bradisfer-powerbi-ro` e o conteudo JSON da chave em uma unica linha. No Power BI Service, cadastre uma conexao de nuvem Google BigQuery com a mesma identidade.

O conector segue a orientacao oficial de informar `BillingProject` no codigo M. A carga permanece em modo Import.
