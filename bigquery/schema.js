'use strict';

// One schema contract for DDL, load jobs and MERGE. Money uses NUMERIC.
const field = (name, type = 'STRING', mode = 'NULLABLE') => ({ name, type, mode });
const fields = (names, type) => names.split(' ').map(name => field(name, type));
const common = [field('chave', 'STRING', 'REQUIRED'), field('data_emissao', 'DATE', 'REQUIRED'),
  ...fields('empresa_id empresa canal cfop segmento'), field('atualizado_em', 'TIMESTAMP')];
const note = [...common, ...fields('nota_id pedido_id vendedor_id vendedor cliente_id cliente cidade uf'),
  ...fields('total_fiscal ajuste_fiscal', 'NUMERIC')];
const item = [...note.filter(f => !['total_fiscal', 'ajuste_fiscal'].includes(f.name)),
  ...fields('chave_nota produto_id produto marca grupo categoria'),
  ...fields('quantidade valor_liquido ajuste_fiscal_alocado valor_faturado custo_total', 'NUMERIC')];
const raw = [field('chave', 'STRING', 'REQUIRED'), field('data_emissao', 'DATE', 'REQUIRED'),
  ...fields('empresa_id payload_sha256 payload'), field('atualizado_em', 'TIMESTAMP')];
const tables = {
  raw_notas_saida: { dataset: 'raw', fields: raw, partition: 'data_emissao' },
  raw_itens_notas_saida: { dataset: 'raw', fields: [...raw, field('chave_nota')], partition: 'data_emissao' },
  fato_vendas_resumo: { dataset: 'comercial', fields: [...note.filter(f => !['total_fiscal', 'ajuste_fiscal'].includes(f.name)), field('marca'), ...fields('quantidade faturamento', 'NUMERIC')], partition: 'data_emissao' },
  fato_itens_vendidos: { dataset: 'comercial', fields: item, partition: 'data_emissao' },
  // Internal fiscal grain, used for counts without multiplying notes by brand.
  notas_fiscais: { dataset: 'comercial', fields: note, partition: 'data_emissao' },
  fato_estoque_atual: { dataset: 'comercial', fields: [field('chave', 'STRING', 'REQUIRED'),
    ...fields('produto_id codigo_barras produto marca grupo subgrupo unidade'),
    ...fields('estoque_disponivel estoque_fisico minimo maximo custo preco', 'NUMERIC'), field('atualizado_em', 'TIMESTAMP')] },
  metas_vendedor_marca: { dataset: 'comercial', fields: [field('chave', 'STRING', 'REQUIRED'), field('mes', 'DATE'),
    ...fields('empresa_id vendedor_id marca'), field('meta', 'NUMERIC'), field('atualizado_em', 'TIMESTAMP')] },
  conciliacao_cargas: { dataset: 'comercial', fields: [field('execucao_id'), field('fonte'), field('grupo'),
    ...fields('esperado observado diferenca', 'NUMERIC'), field('status'), field('atualizado_em', 'TIMESTAMP')] },
  etl_execucoes: { dataset: 'comercial', fields: [field('execucao_id'), field('inicio', 'TIMESTAMP'), field('fim', 'TIMESTAMP'),
    field('data_inicio', 'DATE'), field('data_fim', 'DATE'), field('status'), field('linhas', 'INTEGER'), field('erro')] },
};

function config(env = process.env) {
  const c = { project: env.BQ_PROJECT_ID, raw: env.BQ_RAW_DATASET, comercial: env.BQ_COMERCIAL_DATASET,
    staging: env.BQ_STAGING_DATASET, location: env.BQ_LOCATION, maximumBytesBilled: env.BQ_MAX_BYTES || '1000000000' };
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(c.project || '')) throw new Error('BQ_PROJECT_ID obrigatório/inválido');
  for (const key of ['raw', 'comercial', 'staging']) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(c[key] || '')) throw new Error(`Dataset ${key} obrigatório/inválido`);
  }
  if (new Set([c.raw, c.comercial, c.staging]).size !== 3) throw new Error('Datasets devem ser separados');
  if (!/^[a-zA-Z0-9-]+$/.test(c.location || '')) throw new Error('BQ_LOCATION obrigatória/inválida');
  if (!/^[1-9][0-9]*$/.test(c.maximumBytesBilled)) throw new Error('BQ_MAX_BYTES inválido');
  return c;
}
const ref = (c, name) => `\`${c.project}.${c[tables[name].dataset]}.${name}\``;
function ddl(c) {
  const statements = Object.entries(tables).map(([name, t]) =>
    `CREATE TABLE IF NOT EXISTS ${ref(c, name)} (\n  ${t.fields.map(f => `\`${f.name}\` ${f.type === 'INTEGER' ? 'INT64' : f.type}${f.mode === 'REQUIRED' ? ' NOT NULL' : ''}`).join(',\n  ')}\n)${t.partition ? `\nPARTITION BY ${t.partition}\nCLUSTER BY empresa_id${name.startsWith('raw_') ? '' : ', canal, cfop'}` : ''};`);
  const view = (name, sql) => statements.push(`CREATE OR REPLACE VIEW \`${c.project}.${c.comercial}.${name}\` AS\n${sql};`);
  const n = ref(c, 'notas_fiscais'), i = ref(c, 'fato_itens_vendidos'), s = ref(c, 'fato_vendas_resumo');
  view('vw_vendas_bradisfer', `SELECT empresa_id EmpresaId, empresa Empresa, nota_id IdVenda, pedido_id IdPedidoOrigem,
    data_emissao DataEmissao, vendedor_id IdVendedor, vendedor Vendedor, cliente_id IdCliente, cliente Cliente,
    cidade Cidade, uf UF, canal Canal, marca Marca, quantidade Quantidade, faturamento Faturamento,
    chave ChaveResumo, atualizado_em AtualizadoEm FROM ${s} WHERE segmento = 'b2b'`);
  view('vw_vendas_online_resumo', `WITH custos AS (SELECT chave_nota, SUM(custo_total) custo FROM ${i} GROUP BY 1)
    SELECT empresa_id EmpresaId, MAX(empresa) Empresa, data_emissao DataEmissao, canal Canal,
    COUNT(*) Vendas, SUM(total_fiscal) Faturamento, SUM(total_fiscal-ajuste_fiscal) ReceitaLiquidaItens,
    SUM(ajuste_fiscal) AjusteFiscal, SUM(COALESCE(custo,0)) CustoTotalItens,
    ROUND(SAFE_DIVIDE(SUM(total_fiscal),COUNT(*)),2) TicketMedio,
    CONCAT(empresa_id,'|',CAST(data_emissao AS STRING),'|',canal) ChaveResumo,
    MAX(atualizado_em) AtualizadoEm FROM ${n} LEFT JOIN custos ON chave=chave_nota
    WHERE segmento = 'online' GROUP BY 1,3,4`);
  view('vw_vendas_online_itens', `WITH itens AS (SELECT *,
    IF(produto_id != '',produto_id,CONCAT(REGEXP_REPLACE(NORMALIZE(UPPER(produto),NFD),r'\\p{M}',''),'|',REGEXP_REPLACE(NORMALIZE(UPPER(marca),NFD),r'\\p{M}',''))) produto_chave
    FROM ${i} WHERE segmento='online')
    SELECT empresa_id EmpresaId, MAX(empresa) Empresa, data_emissao DataEmissao, canal Canal,
    cfop CFOP, MAX(produto_id) IdProduto,
    ARRAY_AGG(produto ORDER BY chave LIMIT 1)[OFFSET(0)] Produto,
    ARRAY_AGG(marca ORDER BY chave LIMIT 1)[OFFSET(0)] Marca,
    ARRAY_AGG(grupo ORDER BY chave LIMIT 1)[OFFSET(0)] Grupo,
    ARRAY_AGG(categoria ORDER BY chave LIMIT 1)[OFFSET(0)] Categoria,
    SUM(quantidade) Quantidade, COUNT(DISTINCT chave_nota) PedidosComProduto, SUM(valor_liquido) ValorLiquidoItem,
    SUM(ajuste_fiscal_alocado) AjusteFiscalAlocado, SUM(valor_faturado) ValorFaturado, SUM(custo_total) CustoTotalItem,
    SUM(valor_faturado-custo_total) MargemBruta,
    CONCAT(empresa_id,'|',CAST(data_emissao AS STRING),'|',canal,'|',cfop,'|',produto_chave) ChaveResumoItem,
    MAX(atualizado_em) AtualizadoEm
    FROM itens GROUP BY empresa_id,data_emissao,canal,cfop,produto_chave`);
  view('dim_produto', `WITH produtos AS (
    SELECT produto_id, produto, marca, grupo, categoria, atualizado_em, chave FROM ${i}
    UNION ALL SELECT produto_id, produto, marca, grupo, subgrupo categoria, atualizado_em, chave FROM ${ref(c, 'fato_estoque_atual')})
    SELECT produto_id, produto, marca, grupo, categoria FROM produtos
    WHERE produto_id != '' QUALIFY ROW_NUMBER() OVER(PARTITION BY produto_id ORDER BY atualizado_em DESC, chave DESC, produto DESC)=1`);
  for (const dim of ['cliente', 'vendedor']) view(`dim_${dim}`, `SELECT empresa_id, ${dim}_id, ${dim} FROM ${n}
    QUALIFY ROW_NUMBER() OVER(PARTITION BY empresa_id, ${dim}_id ORDER BY atualizado_em DESC, chave DESC)=1`);
  view('dim_canal', `SELECT DISTINCT canal, segmento FROM ${n}`);
  return statements.join('\n\n') + '\n';
}
module.exports = { tables, config, ref, ddl };
if (require.main === module) process.stdout.write(ddl(config()));
