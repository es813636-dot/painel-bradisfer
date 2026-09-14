# BigQuery — carga paralela Bradisfer

Implementação inicial do [plano 007](../plans/007-migracao-google-sheets-bigquery-powerbi.md). O dashboard, o Power BI, as abas e os workflows existentes permanecem intactos. Nenhum agendamento novo é ativado. Nenhuma rotina deste diretório escreve no Sheets.

## Executar sem credenciais

Node.js 20 ou superior, a partir de `bigquery/`:

```sh
npm ci --ignore-scripts
npm test
npm run simulate
node run.js --fixture test/fixture.json --start 2026-09-10 --end 2026-09-10 --stock
```

Fixtures contêm somente dados fictícios. Simulação não inicializa cliente BigQuery, não carrega ADC e não publica nada. O relatório registra `NAO_VALIDADO` para serviços que não foram consultados; sucesso de fixture não comprova conciliação real. Relatórios ficam em `output/<execucao>.json`, ignorados pelo Git. Não são gravados payloads, nomes de clientes ou credenciais nos relatórios.

Validação local em 14/09/2026: 71 testes passaram ao executar `node --test bigquery/test/*.test.js automacao-vendas/*.test.js` na raiz do repositório; `terraform validate` passou com Terraform 1.9.8 e provider Google 6.50.0. Esses testes exercitam transformação, falhas e orquestração com doubles; execução e idempotência do SQL no serviço BigQuery continuam pendentes da infraestrutura real.

Para consultar a API existente sem escrever, disponibilize `SYSEMP_TOKEN` no ambiente:

```sh
node run.js --start 2026-09-02 --end 2026-09-08
```

Datas omitidas usam hoje em São Paulo e os seis dias anteriores. Há limite de 31 dias por execução. Histórico desde 02/01/2026 deve ser dividido em janelas pequenas, inicialmente de um dia. O endpoint fiscal é consultado para empresas 1, 3 e 4; a transformação fiscal existente determina os segmentos válidos. Estoque é opcional (`--stock`) e representa o catálogo atual do endpoint existente, sem inventar uma empresa para dados que a resposta não identifica.

## Contrato de dados

`schema.js` é a fonte versionada dos esquemas usados pelo DDL, pelos load jobs e pelo MERGE. Dinheiro usa `NUMERIC`; IDs, códigos de barras e CFOP são texto. Partições de vendas usam `data_emissao`, com clustering por empresa/canal/CFOP. Todos os datasets devem ter a mesma localização.

| Objeto | Granularidade / origem |
|---|---|
| `raw.raw_notas_saida` | Uma nota por empresa + ID; cabeçalho JSON, inclusive canceladas/excluídas, hash SHA-256 e instante da extração |
| `raw.raw_itens_notas_saida` | Um item bruto por empresa + nota + posição no payload; preserva repetições legítimas de produto |
| `comercial.notas_fiscais` | Uma nota fiscal selecionada; total e ajuste fiscal sem multiplicação por produto/marca |
| `comercial.fato_itens_vendidos` | Empresa + nota + produto, conforme agrupamento da transformação atual; rateio fiscal e custos |
| `comercial.fato_vendas_resumo` | Empresa + nota + marca, B2B e online; faturamento aditivo |
| `comercial.fato_estoque_atual` | Snapshot completo por ID do produto; estoque disponível e físico separados |
| `comercial.dim_produto` | View dos itens vendidos e catálogo; versão mais recente por produto |
| `comercial.dim_cliente`, `dim_vendedor` | Views com chave composta empresa + ID; versão mais recente, sem histórico SCD |
| `comercial.dim_canal` | View distinta de canal + segmento |
| `comercial.metas_vendedor_marca` | Esquema reservado por mês/empresa/vendedor/marca; sem carga automática até mapear a entrada manual |
| `comercial.etl_execucoes` | Execução, período, início/fim, status, linhas e erro sanitizado |
| `comercial.conciliacao_cargas` | Valores esperados/observados e diferença por fonte/grupo/execução |
| `staging.*_<execucao>` | Tabelas isoladas de cada tentativa, com expiração em 24 horas |

`vw_vendas_bradisfer`, `vw_vendas_online_resumo` e `vw_vendas_online_itens` preservam os nomes de colunas dos resumos fiscais atuais. Os tipos são nativos do BigQuery. A compatibilidade com consultas M e medidas DAX reais ainda precisa ser validada em cópia do modelo. Estas views não alteram a fonte de produção.

Dados raw representam a última versão da janela, e não um arquivo imutável de todas as versões. Os hashes, horários e registros de execução permitem rastrear a carga. Não há bucket adicional ou streaming insert; são usados load jobs com esquema explícito e tolerância zero a registros inválidos.

## Publicação e conciliação

1. Validar período, destino e integridade de todas as páginas da API. Paginação incompleta, status inválido, nota fora do filtro, número inválido e chave repetida interrompem a execução.
2. Reutilizar `prepareData`, `validatePrepared` e `summarizeB2B` do script fiscal atual, sem chamar sua função principal. Preservar regras de canais, cancelamentos, vendedor 1604 e rateio em centavos.
3. Conciliar nota versus itens por empresa/data/canal/CFOP. Comparar Sheets B2B e online por empresa/data/canal, a granularidade disponível nas abas resumidas. O Sheets não fornece CFOP nesses resumos; essa dimensão é conferida contra a API no BigQuery.
4. Bloquear publicação se houver grupo ausente, duplicata ou diferença superior a R$ 0,01 por grupo. Totais globais não compensam diferenças entre grupos. Sheets desatualizado pode bloquear uma carga correta: aguardar sua atualização e tentar novamente, preferindo datas fechadas no primeiro teste.
5. Registrar execução, carregar staging com expiração e consultar os totais desse staging no BigQuery. Exigir conciliação API/BigQuery.
6. Executar um único script transacional: MERGE por chave; remover registros ausentes somente na janela completa consultada (inclui cancelamentos, mudança de canal/vendedor e itens retirados); verificar contagens, conteúdo, duplicatas e totais fiscais; registrar conciliação e sucesso; COMMIT. Se uma nota mudou de data para fora da janela antiga, a publicação é bloqueada e exige ampliar a janela para incluir ambas as datas.

Repetir o mesmo período converge para as mesmas chaves e valores, atualizando o horário de extração. Não há checkpoint que possa avançar após carga parcial. Um snapshot de estoque substitui o catálogo atual somente dentro da mesma transação. Carga vazia é bloqueada por padrão; `--allow-empty` existe apenas na CLI para um operador que tenha confirmado o vazio na API e no Sheets. O workflow não expõe essa exceção.

Falhas de origem/conciliação anteriores ao acesso GCP ficam no relatório local. Falhas confirmadas depois do início da carga também atualizam `etl_execucoes`. Uma resposta incerta de publicação deve ser investigada pelo job `bradisfer_publish_<execucao>` e por `etl_execucoes`: o servidor pode ter confirmado a transação mesmo sem resposta ao cliente. O cliente recupera o mesmo job ID após falha de submissão, nunca envia automaticamente outra transação e não tenta compensar uma publicação incerta. Staging expira mesmo se houver falha ou interrupção.

## Infraestrutura e identidades

`infra/main.tf` cria três datasets, duas contas de serviço e federação OIDC. Aplicação de infraestrutura e DDL exige um operador GCP separado; o usuário de runtime não tem poderes de administração de datasets ou IAM.

| Identidade | Acesso |
|---|---|
| GitHub `bradisfer-github-bq` | `jobUser` no projeto; papel customizado com get/getData/updateData/list somente em raw/comercial; `dataEditor` somente em staging para criar tabelas temporárias |
| Power BI `bradisfer-powerbi-ro` | `jobUser` no projeto e `dataViewer` somente em comercial; nenhum acesso a raw/staging e nenhuma permissão de escrita |
| Leitura Sheets | Compartilhar a planilha com `bradisfer-github-bq` como **Leitor**; cliente usa apenas escopo `spreadsheets.readonly` |

OIDC restringe IDs numéricos do repositório e proprietário, branch, caminho do workflow e environment `bigquery-paralelo`. Os IDs do exemplo foram consultados no GitHub: repo `1334484891`, proprietário `315996237`. Não são secrets. A referência permitida por padrão é `refs/heads/main`; uma branch de PR não recebe acesso de escrita.

Não é criada chave permanente do escritor GitHub. Não se reutiliza `GOOGLE_SERVICE_ACCOUNT_KEY` das automações atuais. A chave/leitura Power BI deve ser configurada apenas no serviço Power BI quando houver autorização para testar uma cópia; nunca no GitHub. Se o conector escolhido precisar da Storage Read API, um administrador poderá acrescentar `roles/bigquery.readSessionUser` ao leitor no projeto, após validar essa necessidade. A CLI aceita `BQ_SHEETS_READER_KEY` como alternativa para uma conta exclusiva de leitura; o workflow prefere ADC/OIDC sem chave.

## O que falta para executar no GCP

Nenhum valor abaixo foi presumido ou provisionado nesta entrega:

- Projeto GCP dedicado (`BQ_PROJECT_ID`) e conta de cobrança vinculada.
- Região confirmada (`BQ_LOCATION`) e nomes definitivos dos três datasets (`BQ_RAW_DATASET`, `BQ_COMERCIAL_DATASET`, `BQ_STAGING_DATASET`). Os nomes no exemplo são sugestões.
- Operador com permissão para ativar APIs, criar datasets/papéis/contas/federação e aplicar o DDL.
- Aplicar Terraform; obter `BQ_WORKLOAD_IDENTITY_PROVIDER` e `BQ_WRITER_SERVICE_ACCOUNT` dos outputs.
- Criar environment GitHub `bigquery-paralelo`, com restrição de branch e revisão apropriada, e cadastrar essas variáveis. O workflow deve estar integrado à branch principal para o disparo manual padrão.
- Definir `BQ_SHEETS_ID` (planilha atual: `1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A`) e compartilhar como Leitor com o escritor GCP; disponibilizar o secret existente `SYSEMP_TOKEN` ao environment. Não é possível extrair o valor de secrets do GitHub para testes locais.
- Configurar orçamento e alertas de R$ 20 / R$ 50 na conta de cobrança e destinatários. **Orçamentos alertam; não são um bloqueio automático de gastos.** `BQ_MAX_BYTES` limita cada query (padrão 1 GB), não o custo mensal total nem armazenamento; definir também quotas operacionais conforme volume real.
- Identificar abas e contrato de metas, carteiras e ajustes manuais. A tabela de metas fica vazia até esse mapeamento; nenhum dado manual é presumido.
- Validar SQL, IAM/OIDC, permissões de leitura Sheets, carga real repetida, cancelamento/correção, custos e Power BI em cópia durante os sete dias de paralelo previstos. Nenhuma dessas verificações em nuvem é substituída pelos testes locais.

Sequência do operador, a partir de `bigquery/`, com variáveis acima configuradas:

```sh
terraform -chdir=infra init
terraform -chdir=infra plan -var-file=local.tfvars
terraform -chdir=infra apply -var-file=local.tfvars
mkdir -p output
node schema.js > output/schema.sql
bq --project_id="$BQ_PROJECT_ID" --location="$BQ_LOCATION" query --use_legacy_sql=false < output/schema.sql
node run.js --start 2026-09-02 --end 2026-09-02 --sheets
node run.js --start 2026-09-02 --end 2026-09-02 --sheets --write
```

Comandos acima são exemplos de shell POSIX; no PowerShell, defina variáveis com `$env:NOME`. Revisar o SQL gerado antes de executá-lo com a identidade de bootstrap. DDL usa `CREATE TABLE IF NOT EXISTS`: não substitui tabelas existentes nem migra automaticamente um esquema incompatível. Views são criadas/atualizadas apenas por esse operador. Não usar o bootstrap no workflow de carga.

O workflow `bigquery-paralelo.yml` é somente `workflow_dispatch`, começa por fixtures/testes e tem `origem=fixture`/`modo=simulacao` como padrão. Modo `publicar` exige origem API e conciliação Sheets. Não há cron, alteração de agendamentos atuais ou etapa de Power BI.

## Recuperação e aceite

Em divergência: consultar o relatório, resolver a fonte ou esperar o Sheets e reexecutar a mesma janela. Em job pendente: consultar seu resultado antes de qualquer nova carga. Em erro dentro da transação: dados anteriores são preservados. Em erro após uma publicação comprovadamente incorreta: corrigir transformação/origem e reprocessar a janela; não apagar raw/comercial indiscriminadamente.

Interromper o uso do novo workflow basta para suspender o paralelo. Sheets e Power BI continuam operando pela arquitetura existente. A virada exige uma tarefa posterior expressamente autorizada, sete dias de evidência e validação das consultas/DAX em cópia.

Referências técnicas: [transações BigQuery](https://docs.cloud.google.com/bigquery/docs/transactions), [MERGE](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/dml-syntax), [papéis IAM](https://docs.cloud.google.com/bigquery/docs/access-control), [federação para pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
