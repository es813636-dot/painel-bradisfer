# Migração do Google Sheets para BigQuery + Power BI

**Data:** 14/09/2026  
**Escopo:** vendas B2B e marketplace, itens vendidos, estoque, metas e dimensões comerciais  
**Recomendação:** Google BigQuery como banco analítico; Google Sheets mantido apenas para entradas manuais

**Status:** infraestrutura, esquema, carga histórica e conciliação real concluídos em 14/09/2026. A carga paralela incremental passa a ser disparada após cada atualização fiscal bem-sucedida do Sheets e continua bloqueando publicações divergentes. A arquitetura atual permanece em produção; a troca da fonte do Power BI depende do período de validação paralela.

## 1. Motivo da migração

A planilha atual ocupa aproximadamente 9,23 milhões de células, cerca de 92% do limite de 10 milhões. A carga completa com o detalhe B2B projetou 10.879.286 células e já não cabe no arquivo.

O BigQuery atende melhor ao uso atual porque:

- possui conector nativo no Power BI, em modo Import e DirectQuery;
- não exige servidor ou banco ligado permanentemente;
- recebe dados diretamente da automação executada pelo GitHub Actions;
- permite histórico detalhado, consultas SQL, particionamento e controle de custos;
- oferece 10 GiB de armazenamento e 1 TiB de consultas mensais na faixa gratuita.

## 2. Arquitetura final

```text
API Sysemp
    │
    ▼
GitHub Actions — autenticação OIDC
    │
    ├──► BigQuery / raw       payload normalizado e rastreabilidade
    │
    └──► BigQuery / comercial fatos, dimensões e conciliação
              │
              ▼
          Power BI

Google Sheets ──► metas, carteiras e ajustes manuais
```

Tabelas propostas:

- `raw_notas_saida`
- `raw_itens_notas_saida`
- `fato_vendas_resumo`
- `fato_itens_vendidos`
- `fato_estoque_atual`
- `dim_produto`
- `dim_cliente`
- `dim_vendedor`
- `dim_canal`
- `metas_vendedor_marca`
- `conciliacao_cargas`
- `etl_execucoes`

As tabelas de vendas serão particionadas por `data_emissao`. Empresa, canal, CFOP e marca serão usados para organização e filtros das consultas. Cada registro terá uma chave única para permitir reprocessamento sem duplicação.

## 3. Etapas

### Etapa 1 — Preparação do Google Cloud

Prazo: meio dia.

1. Criar um projeto Google Cloud exclusivo para BI.
2. Ativar BigQuery e cobrança.
3. Definir a localização do conjunto de dados.
4. Criar ambientes `raw` e `comercial`.
5. Configurar orçamento e alertas em R$ 20 e R$ 50.
6. Configurar autenticação OIDC entre GitHub e Google Cloud, evitando uma chave permanente no repositório.

### Etapa 2 — Banco e carga incremental

Prazo: um dia.

1. Criar as tabelas e tipos de dados.
2. Adaptar `automacao-vendas/atualizar-vendas-notas-itens.js` para gravar no BigQuery.
3. Usar `MERGE` pelas chaves únicas.
4. Reprocessar diariamente a janela móvel dos últimos sete dias.
5. Registrar início, fim, quantidade, valores, erros e conciliação de cada execução.
6. Manter temporariamente a escrita das tabelas resumidas no Sheets.

### Etapa 3 — Carga histórica

Prazo: um dia.

1. Importar as vendas de 02/01/2026 até a data atual.
2. Incluir Bradisfer e Construbrag.
3. Incluir B2B e os canais marketplace usados no painel.
4. Executar a carga em lotes por período para respeitar a API Sysemp.
5. Conciliar por empresa, data, canal e CFOP.
6. Confirmar diferença financeira máxima de R$ 0,01 por agrupamento.

### Etapa 4 — Power BI

Prazo: um dia.

1. Criar consultas BigQuery paralelas às consultas atuais.
2. Preservar nomes e tipos usados pelas medidas DAX.
3. Conectar fatos de resumo, itens e estoque às dimensões.
4. Validar filtros de data, empresa, vendedor, marca, canal, produto e CFOP.
5. Manter o modo Import inicialmente.
6. Configurar credenciais da conta de serviço no Power BI Service.

### Etapa 5 — Validação paralela

Prazo: sete dias corridos, sem bloquear o uso do painel.

Durante esse período, Sheets e BigQuery serão atualizados juntos. A migração será aceita quando:

- totais por empresa, dia, canal e CFOP coincidirem;
- não houver chaves duplicadas;
- todas as execuções incrementais terminarem com sucesso;
- o Power BI atualizar sem erro;
- os totais do dashboard coincidirem com a conciliação fiscal.

### Etapa 6 — Corte e limpeza

Prazo: meio dia.

1. Trocar as consultas principais do Power BI para o BigQuery.
2. Parar de gravar histórico detalhado no Sheets.
3. Manter no Sheets apenas metas, carteiras, ajustes manuais e uma aba resumida de conferência.
4. Preservar as consultas antigas desabilitadas por 30 dias para rollback.
5. Documentar responsáveis, credenciais, tabelas e procedimento de recuperação.

## 4. Estimativa de custo

Conversão usada: **US$ 1 = R$ 5,12**, sem considerar variação cambial e tributos do cartão.

| Componente | Estimativa mensal | Observação |
|---|---:|---|
| BigQuery — armazenamento | R$ 0 | Volume atual deve ficar abaixo dos 10 GiB gratuitos |
| BigQuery — consultas | R$ 0 | O uso previsto fica muito abaixo de 1 TiB mensal gratuito |
| Transferência e excedentes | R$ 0 a R$ 30 | Reserva conservadora; deve ser monitorada após o Power BI entrar em produção |
| GitHub Actions | R$ 0 | Aproximadamente 570 execuções mensais; expectativa abaixo da franquia de minutos do plano |
| Power BI | R$ 0 adicional | Mantém a licença já utilizada |
| Google Sheets | R$ 0 adicional | Continua apenas com tabelas pequenas e entradas manuais |
| **Total recorrente esperado** | **R$ 0 a R$ 30/mês** | Configurar orçamento para impedir surpresa |

O Google Cloud exige uma conta de cobrança para uso normal, mesmo que o consumo fique dentro da faixa gratuita.

### Custo único de implantação

Estimativa técnica: **16 a 24 horas de trabalho**, distribuídas por cinco dias úteis, mais sete dias de observação paralela. Não existe licença adicional obrigatória para executar a migração no projeto atual.

Caso o serviço seja terceirizado, o custo será `16–24 horas × valor/hora do prestador`. Como referência matemática, a R$ 150/h, o projeto custaria entre **R$ 2.400 e R$ 3.600**.

## 5. Alternativa

O Supabase Pro oferece PostgreSQL gerenciado a partir de US$ 25/mês, aproximadamente R$ 128/mês antes de impostos, com 8 GB de disco e backups diários por sete dias. É uma opção melhor se o mesmo banco também alimentar um sistema operacional com cadastros e gravações feitas por usuários. Para o cenário atual, centrado em análise e Power BI, o BigQuery tem custo menor e exige menos administração.

## 6. Controle de risco e rollback

- A planilha permanece ativa durante toda a migração.
- O Power BI só muda de fonte depois da conferência paralela.
- As consultas antigas ficam preservadas por 30 dias.
- Toda carga registra quantidade, valor e diferença de conciliação.
- O GitHub Actions falha antes de publicar dados quando encontra divergência.
- Um orçamento no Google Cloud alerta sobre consumo inesperado; não bloqueia gastos automaticamente. Limites de consultas e quotas devem ser configurados separadamente.

## 7. Referências de preço e compatibilidade

- BigQuery: https://cloud.google.com/bigquery/pricing
- Faixa gratuita do Google Cloud: https://cloud.google.com/free/docs/free-cloud-features
- Conector BigQuery do Power BI: https://learn.microsoft.com/power-query/connectors/google-bigquery
- GitHub Actions: https://docs.github.com/billing/concepts/product-billing/github-actions
- Autenticação GitHub OIDC no Google Cloud: https://docs.github.com/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-google-cloud-platform
- Supabase: https://supabase.com/pricing
