FROM node:20-bookworm-slim
WORKDIR /app
COPY bigquery/package*.json ./bigquery/
RUN cd bigquery && npm ci --ignore-scripts && npm cache clean --force
COPY bigquery/*.js ./bigquery/
COPY automacao-vendas/atualizar-vendas-notas-itens.js ./automacao-vendas/
WORKDIR /app/bigquery
RUN mkdir output && chown node:node output
USER node
ENV NODE_ENV=production
CMD ["node", "scheduled.js"]
