# Relatório Gamma dos vendedores

Workflow `Gamma - relatório mensal dos vendedores`: modos `preparar` (sem geração), `gerar` e `retomar` (consultar uma geração existente pelo ID). Mês vazio consulta o mês anterior, no horário de Brasília. Somente meses encerrados.

Fontes: API SYSEMP `listaPedidosNotasSaida`, empresas 1 e 3, regras B2B da integração existente, Marcus excluído, e aba `Meta_Marca` da planilha do Power BI. Apresentação base: `g_1nbzbz920ocjuts`, com João, Guilherme, Alexandre e Cristina. Variável opcional `GAMMA_TEMPLATE_ID` permite trocar a base. Segredos: `SYSEMP_TOKEN` e `GAMMA_API_KEY`.

Realizado é `total_produtos`; vendas são pedidos distintos por empresa e vendedor. Notas sem identificação de pedido/cliente e metas mensais ausentes impedem a geração. Metas anteriores a setembro de 2026 são identificadas como referências replicadas. A revisão humana dos valores e da apresentação continua necessária.

O conteúdo financeiro fica apenas em arquivo temporário, apagado ao final, sem upload ou impressão nos logs. A apresentação é criada com acesso externo e de workspace desabilitados; o proprietário acessa pelo Gamma. O artefato de resultado contém somente período, ID, link protegido pelo login e créditos, sem exportação pública.

Não há repetição automática de POST. Reserva por mês em artefato impede novas criações nos 90 dias de retenção. Uma falha depois da reserva deve ser investigada, retomando pelo ID, quando disponível. Falha de rede durante o POST pode deixar a criação incerta: conferir a conta Gamma antes de remover uma reserva. Não existe garantia de deduplicação após a retenção ou exclusão dos artefatos.

Agendamento mensal: dia 2, às 09h de Brasília (12h UTC), referente ao mês anterior. O GitHub pode atrasar a execução. Manter metas vendedor/marca do mês cadastradas e revisar a apresentação antes de apresentar; metas ausentes interrompem a geração sem consumir créditos. Também é possível executar manualmente.
