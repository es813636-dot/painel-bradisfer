# Carga coordenada: Sysemp → BigQuery → Power BI

Estado: código preparado e testes locais concluídos; Cloud Run/Scheduler e OAuth Microsoft ainda não ativados. O agendamento GitHub continua ativo até o corte validado.

## Comportamento

- Cloud Scheduler executa Cloud Run Jobs a cada cinco minutos, das 05h às 23h55, em America/Sao_Paulo. Isso melhora a previsibilidade, mas não garante latência exata de cinco minutos.
- A carga cobre hoje e ontem; às 04h30 uma execução reconcilia sete dias.
- Uma trava no bucket privado evita execuções simultâneas entre os dois agendamentos. O bucket não contém vendas ou tokens. Não há tomada automática de trava expirada: se uma execução for encerrada à força, o operador verifica primeiro se todas as execuções terminaram e só então remove `carga.lock`.
- A publicação BigQuery mantém as transações e a conciliação existentes. Só após `SUCESSO` e `VALIDADO` a integração pode solicitar atualização do Power BI.
- A atualização Microsoft começa desativada. O padrão conservador permite até oito pedidos por dia, com intervalo mínimo de duas horas, considerando também o histórico de atualizações existentes. Não solicita enquanto uma atualização está em andamento. Aumentar limites exige validar a capacidade e alterar a política explicitamente.
- Um POST Microsoft incerto não é repetido automaticamente. A próxima execução consulta o histórico. `SOLICITADO` significa HTTP 202, não atualização concluída; o resultado final deve ser conferido no histórico Power BI.
- O rodapé do PBIP usa `etl_execucoes.fim` da última publicação confirmada, convertido para Brasília. Ele mostra a carga conhecida na última importação do relatório; não é um relógio em tempo real nem o horário da última venda.

## Etapas manuais necessárias

1. Registrar aplicativo no Microsoft Entra para o login que possui o modelo BI no Meu workspace. Configurar cliente público e permissão **delegada** Power BI `Dataset.ReadWrite.All`, com `offline_access`; autorizar esse aplicativo no fluxo OAuth. Não usar service principal para substituir o proprietário do Meu workspace.
2. Obter IDs do tenant/aplicativo e guardar o refresh token OAuth diretamente no Secret Manager, segredo `powerbi-refresh-token`. Não enviar tokens por chat nem adicionar ao Git. Guardar também o token Sysemp existente em `sysemp-token`.
3. Confirmar a região Cloud Run e a localização real do BigQuery. Preencher variáveis Terraform `project_id`, `region`, `bq_location`, `image` e `writer_email`. A conta de carga existente é `bradisfer-github-bq@bradisfer-bi.iam.gserviceaccount.com`.
4. Construir a imagem a partir da raiz do checkout: `docker build -f bigquery/Dockerfile -t <imagem-Artifact-Registry> .`; publicar no Artifact Registry. Confirmar permissões de leitura da imagem para Cloud Run.
5. Aplicar `infra/scheduler/main.tf` em um estado Terraform separado da infraestrutura BigQuery. Os dois agendamentos são criados **pausados**. A criação do job depende da versão inicial do segredo Sysemp; criar os segredos primeiro, adicionar a versão de forma privada e só então aplicar o job. Nenhum valor de token é armazenado no Terraform.
6. Validar uma execução manual isolada do Cloud Run, com a carga GitHub parada durante esse teste, e conferir notas, itens e valores. Confirmar que o bucket privado e as permissões de carga permitem acesso e que não há dois escritores ativos.
7. Preencher os IDs Microsoft, ativar `refresh_enabled`, executar e conferir o histórico do modelo `709ebd76-0982-4a78-bd8c-8fc429df14aa`. A conta de carga lê apenas os dois segredos e pode adicionar versões apenas ao refresh token para preservar rotações OAuth.
8. Após validação, remover apenas os gatilhos `schedule` de `.github/workflows/bigquery-paralelo.yml` (manter workflow_dispatch), publicar essa mudança e despausar os dois Cloud Scheduler jobs. Não deixar os agendamentos GitHub e Cloud ativos juntos.
9. No Power BI Desktop, abrir `C:\Users\Admin\Documents\Dados BI\BI.pbip`, atualizar a tabela `Atualizacao_Dados`, validar o novo rodapé e republicar BI. O arquivo local foi alterado com backup; o rodapé Web só muda após republicação.
10. Manter o agendamento Power BI existente durante implantação; depois da integração OAuth validada, desativar os horários independentes para evitar pedidos duplicados e consumo do orçamento diário.

## Permissões e revisão antes de ativar

Terraform adiciona ao escritor existente acesso aos segredos Sysemp/OAuth e ao bucket de controle. A conta Scheduler pode executar somente o job Bradisfer, incluindo sobrescrever a janela de reconciliação. O consentimento Entra concede ao aplicativo acesso delegado de leitura/escrita de datasets do usuário: confirmar esse alcance antes do consentimento. Para isolamento por modelo, migrar futuramente para um workspace próprio e uma integração com acesso restrito a ele.

## Validação

`npm ci --ignore-scripts` e `npm test` em bigquery. Os testes cobrem trava, ordem carga/refresh, falha da origem, refresh em andamento, limite diário, intervalo e POST incerto. Terraform e contêiner ainda precisam de validação no ambiente Cloud; não confundir testes locais com implantação.

Referências oficiais: [Cloud Run Jobs + Scheduler](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule), [Power BI refresh API e limites](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/refresh-dataset), [Histórico de atualizações](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/get-refresh-history).
