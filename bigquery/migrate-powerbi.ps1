param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,
    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
$tablesPath = Join-Path $ProjectPath 'BI.SemanticModel\definition\tables'
if (-not (Test-Path -LiteralPath $tablesPath -PathType Container)) {
    throw "Projeto PBIP invalido: $tablesPath nao existe."
}

$sources = [ordered]@{}

$sources['Fact_Vendas'] = @'
	partition Fact_Vendas = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    Dados = Comercial{[Name="vw_vendas_bradisfer", Kind="View"]}[Data],
				    #"Cliente Normalizado" = Table.TransformColumns(Dados, {{"Cliente", each Text.Trim(Text.Clean(_)), type text}}),
				    #"Tipos Ajustados" = Table.TransformColumnTypes(#"Cliente Normalizado", {{"DataEmissao", type date}, {"Quantidade", Int64.Type}, {"Faturamento", type number}}),
				    #"Colunas Renomeadas" = Table.RenameColumns(#"Tipos Ajustados", {{"IdVenda", "IdPedido"}, {"DataEmissao", "Data"}, {"Quantidade", "Qtd"}, {"ChaveResumo", "VendaID"}}),
				    #"Coluna Mes" = Table.AddColumn(#"Colunas Renomeadas", "Mes", each Date.ToText([Data], "yyyy-MM"), type text),
				    #"Colunas Placeholder" = Table.AddColumn(Table.AddColumn(#"Coluna Mes", "Produto", each null, type text), "Grupo", each null, type text),
				    #"Colunas Removidas" = Table.RemoveColumns(#"Colunas Placeholder", {"EmpresaId", "IdPedidoOrigem", "IdVendedor", "IdCliente", "AtualizadoEm"})
				in
				    #"Colunas Removidas"
'@

$sources['Dim_Cliente'] = @'
	partition Dim_Cliente = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    Dados = Comercial{[Name="vw_vendas_bradisfer", Kind="View"]}[Data],
				    #"Cliente Normalizado" = Table.TransformColumns(Dados, {{"Cliente", each Text.Trim(Text.Clean(_)), type text}}),
				    #"Tipos Ajustados" = Table.TransformColumnTypes(#"Cliente Normalizado", {{"DataEmissao", type date}, {"Quantidade", type number}, {"Faturamento", type number}}),
				    #"Agrupado" = Table.Group(#"Tipos Ajustados", {"Cliente"}, {
				        {"Cidade", each List.First(List.RemoveNulls([Cidade]), null), type text},
				        {"UF", each List.First(List.RemoveNulls([UF]), null), type text},
				        {"QtdCompras", each Table.RowCount(Table.Distinct(Table.SelectColumns(_, {"Empresa", "IdVenda"}))), Int64.Type},
				        {"FaturamentoTotal", each List.Sum([Faturamento]), type number},
				        {"PrimeiraCompra", each List.Min([DataEmissao]), type date},
				        {"UltimaCompra", each List.Max([DataEmissao]), type date}
				    }),
				    #"Coluna Nome Truncado" = Table.AddColumn(#"Agrupado", "NomeTruncado", each Text.Length(Text.Trim([Cliente])) >= 40, type logical)
				in
				    #"Coluna Nome Truncado"
'@

$sources['Dim_Data'] = @'
	partition Dim_Data = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    B2B = Comercial{[Name="vw_vendas_bradisfer", Kind="View"]}[Data],
				    Online = Comercial{[Name="vw_vendas_online_resumo", Kind="View"]}[Data],
				    Datas = List.RemoveNulls(List.Combine({Table.Column(B2B, "DataEmissao"), Table.Column(Online, "DataEmissao")})),
				    PrimeiraData = if List.IsEmpty(Datas) then Date.From(DateTime.LocalNow()) else Date.From(List.Min(Datas)),
				    UltimaData = if List.IsEmpty(Datas) then PrimeiraData else Date.From(List.Max(Datas)),
				    ListaDatas = List.Dates(PrimeiraData, Duration.Days(UltimaData - PrimeiraData) + 1, #duration(1, 0, 0, 0)),
				    Tabela = Table.FromList(ListaDatas, Splitter.SplitByNothing(), {"Data"}, null, ExtraValues.Error),
				    #"Tipo Data" = Table.TransformColumnTypes(Tabela, {{"Data", type date}}),
				    #"Ano" = Table.AddColumn(#"Tipo Data", "Ano", each Date.Year([Data]), Int64.Type),
				    #"MesNum" = Table.AddColumn(#"Ano", "MesNum", each Date.Month([Data]), Int64.Type),
				    #"MesNome" = Table.AddColumn(#"MesNum", "MesNome", each Text.Proper(Date.MonthName([Data], "pt-BR")), type text),
				    #"AnoMes" = Table.AddColumn(#"MesNome", "AnoMes", each Date.StartOfMonth([Data]), type date),
				    #"Trimestre" = Table.AddColumn(#"AnoMes", "Trimestre", each "T" & Text.From(Date.QuarterOfYear([Data])), type text),
				    #"DiaSemana" = Table.AddColumn(#"Trimestre", "DiaSemana", each Text.Proper(Date.DayOfWeekName([Data], "pt-BR")), type text),
				    #"DiaDoMes" = Table.AddColumn(#"DiaSemana", "DiaDoMes", each Date.Day([Data]), Int64.Type)
				in
				    #"DiaDoMes"
'@

$sources['Fact_VendasOnline'] = @'
	partition Fact_VendasOnline = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    Resumo = Comercial{[Name="fato_vendas_resumo", Kind="Table"]}[Data],
				    Online = Table.SelectRows(Resumo, each [segmento] = "online"),
				    PrimeiraData = Date.From(List.Min(Online[data_emissao])),
				    UltimaData = Date.From(List.Max(Online[data_emissao])),
				    #"Colunas Selecionadas" = Table.SelectColumns(Online, {"vendedor_id", "vendedor", "marca", "cliente", "empresa", "cidade", "uf", "quantidade", "canal", "faturamento", "data_emissao", "chave"}),
				    #"Colunas Renomeadas" = Table.RenameColumns(#"Colunas Selecionadas", {{"vendedor_id", "IdVendedor"}, {"vendedor", "Vendedor"}, {"marca", "Marca"}, {"cliente", "Cliente"}, {"empresa", "Empresa"}, {"cidade", "Cidade"}, {"uf", "UF"}, {"quantidade", "Quantidade"}, {"canal", "Canal"}, {"faturamento", "ValorFaturado"}, {"data_emissao", "DataEmissao"}, {"chave", "ChaveDedup"}}),
				    #"Tipos Ajustados" = Table.TransformColumnTypes(#"Colunas Renomeadas", {{"Quantidade", Int64.Type}, {"ValorFaturado", type number}, {"DataEmissao", type date}}),
				    #"Periodo Inicio" = Table.AddColumn(#"Tipos Ajustados", "PeriodoInicio", each PrimeiraData, type date),
				    #"Periodo Fim" = Table.AddColumn(#"Periodo Inicio", "PeriodoFim", each UltimaData, type date),
				    #"Ordem Final" = Table.ReorderColumns(#"Periodo Fim", {"PeriodoInicio", "PeriodoFim", "IdVendedor", "Vendedor", "Marca", "Cliente", "Empresa", "Cidade", "UF", "Quantidade", "Canal", "ValorFaturado", "DataEmissao", "ChaveDedup"})
				in
				    #"Ordem Final"
'@

$sources['Fact_OnlineResumo'] = @'
	partition Fact_OnlineResumo = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    Dados = Comercial{[Name="vw_vendas_online_resumo", Kind="View"]}[Data],
				    #"Tipos Ajustados" = Table.TransformColumnTypes(Dados, {{"DataEmissao", type date}, {"Vendas", Int64.Type}, {"Faturamento", type number}, {"ReceitaLiquidaItens", type number}, {"AjusteFiscal", type number}, {"CustoTotalItens", type number}, {"TicketMedio", type number}, {"AtualizadoEm", type text}})
				in
				    #"Tipos Ajustados"
'@

$sources['Fact_ItensOnline'] = @'
	partition Fact_ItensOnline = m
		mode: import
		source =
				let
				    Fonte = GoogleBigQuery.Database([BillingProject="bradisfer-bi", UseStorageApi=false]),
				    Projeto = Fonte{[Name="bradisfer-bi"]}[Data],
				    Comercial = Projeto{[Name="bradisfer_comercial", Kind="Schema"]}[Data],
				    Dados = Comercial{[Name="vw_vendas_online_itens", Kind="View"]}[Data],
				    #"Tipos Ajustados" = Table.TransformColumnTypes(Dados, {{"DataEmissao", type date}, {"Quantidade", type number}, {"PedidosComProduto", Int64.Type}, {"ValorLiquidoItem", type number}, {"AjusteFiscalAlocado", type number}, {"ValorFaturado", type number}, {"CustoTotalItem", type number}, {"MargemBruta", type number}, {"AtualizadoEm", type text}})
				in
				    #"Tipos Ajustados"
'@

$utf8 = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $ProjectPath ".backup-pre-bigquery-$stamp"
if (-not $NoBackup) {
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
}

foreach ($table in $sources.Keys) {
    $file = Join-Path $tablesPath "$table.tmdl"
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Tabela ausente: $file" }
    $content = [System.IO.File]::ReadAllText($file)
    $pattern = "(?ms)^\tpartition $([regex]::Escape($table)) = m\r?\n.*?(?=^\tannotation PBI_ResultType)"
    if ([regex]::Matches($content, $pattern).Count -ne 1) {
        throw "Particao inesperada ou duplicada em $file"
    }
    if (-not $NoBackup) { Copy-Item -LiteralPath $file -Destination (Join-Path $backupPath "$table.tmdl") }
    $updated = [regex]::Replace($content, $pattern, $sources[$table] + "`r`n")
    [System.IO.File]::WriteAllText($file, $updated, $utf8)
}

foreach ($table in $sources.Keys) {
    $updated = [System.IO.File]::ReadAllText((Join-Path $tablesPath "$table.tmdl"))
    if ($updated -notmatch 'GoogleBigQuery\.Database\(' -or $updated -match 'GoogleSheets\.Contents\(') {
        throw "Validacao da fonte falhou em $table"
    }
}

Write-Output "Migracao aplicada a $($sources.Count) tabelas em $ProjectPath"
if (-not $NoBackup) { Write-Output "Backup das particoes: $backupPath" }
