// ----------------------------------------------------------------------
// Ponte entre o painel (navegador) e a API da Sysemp, pra busca de
// compras/vendas de 1 produto (clique no modal de detalhe).
//
// Substitui o doGet do Apps Script (projeto "Estoque") só nessa parte
// especifica -- o resto do Apps Script (atualizarEstoque,
// atualizarVendasAoVivo e os gatilhos deles) ja foi desativado antes
// (migrado pro GitHub Actions), entao esse Worker fecha a migracao:
// zero uso continuo do Apps Script.
//
// Motivo da troca: todo Aplicativo da Web do Apps Script passa por um
// redirecionamento interno do Google (pra script.googleusercontent.com)
// antes de responder -- isso adicionava ~20s+ de latencia so de
// infraestrutura, independente do codigo. Um Worker roda na borda da
// rede da Cloudflare, sem esse redirecionamento -- ver LINHAGEM-DE-DADOS.md
// e CONTEXTO.md pro historico completo dessa decisao.
//
// Replica o comportamento do doGet exatamente como estava (mesmos
// endpoints, mesmo payload, mesmo formato de data DD/MM/AAAA) -- so
// troca o transporte, nao a logica.
// ----------------------------------------------------------------------

const URL_COMPRAS = 'https://api.sysemp.com.br/163/listarComprasPorProduto';
const URL_VENDAS_MEDIA = 'https://api.sysemp.com.br/163/listarVendasMediaPorProduto';

// Origem autorizada a chamar esse Worker -- so o painel publicado no
// GitHub Pages. Ajustar aqui se o painel mudar de dominio algum dia.
const ORIGEM_PERMITIDA = 'https://es813636-dot.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGEM_PERMITIDA,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function respostaJson(objeto, status) {
  return new Response(JSON.stringify(objeto), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// Mesmo formato que Utilities.formatDate(data, 'America/Sao_Paulo', 'dd/MM/yyyy')
// produzia no Apps Script -- confirmado com o suporte Sysemp (18/08/2026)
// que e esse o formato esperado pelo endpoint.
function formatarDataBR(data) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(data);
  const dia = partes.find((p) => p.type === 'day').value;
  const mes = partes.find((p) => p.type === 'month').value;
  const ano = partes.find((p) => p.type === 'year').value;
  return dia + '/' + mes + '/' + ano;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const codBarra = url.searchParams.get('codBarra');
    const tipo = url.searchParams.get('tipo'); // 'compras' ou 'vendas'

    if (!codBarra) {
      return respostaJson({ ok: false, erro: 'Parâmetro codBarra não informado.' });
    }

    const token = env.SYSEMP_TOKEN;
    if (!token) {
      return respostaJson({ ok: false, erro: 'SYSEMP_TOKEN não configurado no Worker.' });
    }

    let apiUrl;
    let payload;
    if (tipo === 'vendas') {
      apiUrl = URL_VENDAS_MEDIA;
      // Mesma janela que o doGet original usava: hoje - 1 ano ate hoje
      // (nao "ontem" -- essa versao usa hoje mesmo, igual o original).
      const hoje = new Date();
      const umAnoAtras = new Date(hoje);
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      payload = {
        cod_barra: String(codBarra),
        datainicial: formatarDataBR(umAnoAtras),
        datafinal: formatarDataBR(hoje),
        offset: '0',
      };
    } else {
      apiUrl = URL_COMPRAS;
      payload = { cod_barra: String(codBarra), offset: '0' };
    }

    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Token: token },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const detalhe = await resp.text().catch(() => '(sem corpo)');
        return respostaJson({ ok: false, erro: 'Sysemp respondeu HTTP ' + resp.status, detalhe });
      }

      const dados = await resp.json();
      return respostaJson({ ok: true, dados });
    } catch (err) {
      return respostaJson({ ok: false, erro: String(err) });
    }
  },
};
