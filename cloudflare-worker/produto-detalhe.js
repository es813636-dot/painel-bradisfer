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
const URL_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODELO_IA = 'claude-sonnet-5';

// Origem autorizada a chamar esse Worker -- so o painel publicado no
// GitHub Pages. Ajustar aqui se o painel mudar de dominio algum dia.
const ORIGEM_PERMITIDA = 'https://es813636-dot.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ORIGEM_PERMITIDA,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// ----------------------------------------------------------------------
// Aba "Atenção" -- ponte pra API da Anthropic (Claude), pro resumo
// automático e o chat da análise de compras. A chave (ANTHROPIC_API_KEY)
// fica só aqui como Secret, nunca chega no navegador do usuário -- mesmo
// padrão do SYSEMP_TOKEN acima. Ver CONTEXTO.md pra motivação (motor de
// regras determinístico primeiro, IA por cima só pra explicar/priorizar
// em texto, não pra recalcular os números).
// ----------------------------------------------------------------------

const PROMPT_SISTEMA =
  'Você é um assistente de compras/estoque da Bradisfer, uma distribuidora de ferragens e materiais de construção. ' +
  'Você recebe dados JÁ CALCULADOS por um motor de regras determinístico (curva ABC, cobertura de estoque em dias, lead time por marca) ' +
  'apontando itens com risco de ruptura. Sua função é ANALISAR e PRIORIZAR esses dados em português claro, direto e acionável -- ' +
  'não invente números que não estão no JSON fornecido, não recalcule nada, só interprete e recomende. ' +
  'Seja específico (cite marca/produto quando fizer sentido) e conciso -- o usuário é o dono da distribuidora, sem tempo para texto longo. ' +
  'Use bullet points quando ajudar a escanear rápido. Nunca inclua texto fora do que foi pedido (sem saudação, sem "aqui está sua análise").';

async function chamarClaude(env, mensagens) {
  const chave = env.ANTHROPIC_API_KEY;
  if (!chave) {
    return { ok: false, erro: 'ANTHROPIC_API_KEY não configurada no Worker.' };
  }
  try {
    const resp = await fetch(URL_ANTHROPIC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: 1024,
        system: PROMPT_SISTEMA,
        messages: mensagens,
      }),
    });
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '(sem corpo)');
      return { ok: false, erro: 'Anthropic respondeu HTTP ' + resp.status, detalhe };
    }
    const dados = await resp.json();
    const texto = (dados.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { ok: true, texto };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

// Payload esperado: { acao: 'resumo', contexto: {...} } ou
// { acao: 'chat', contexto: {...}, pergunta: '...', historico: [{papel,texto}, ...] }
// "contexto" é a saída já condensada de calcularAlertas() no script.js
// (top marcas/itens, não o catálogo inteiro) -- mantém o custo por
// chamada baixo e prevísivel independente do tamanho do catálogo.
async function handleIA(request, env) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return respostaJson({ ok: false, erro: 'Corpo da requisição não é JSON válido.' });
  }

  const { acao, contexto, pergunta, historico } = corpo;
  if (!contexto) {
    return respostaJson({ ok: false, erro: 'Campo contexto não informado.' });
  }

  if (acao === 'resumo') {
    const mensagens = [
      { role: 'user', content: 'Dados atuais da análise de compras (JSON): ' + JSON.stringify(contexto) +
        '\n\nEscreva um resumo priorizado (5-8 bullet points no máximo) do que precisa de atenção agora, começando pelo mais urgente.' },
    ];
    const resultado = await chamarClaude(env, mensagens);
    return respostaJson(resultado);
  }

  if (acao === 'chat') {
    if (!pergunta) return respostaJson({ ok: false, erro: 'Campo pergunta não informado.' });
    const mensagens = [
      { role: 'user', content: 'Dados atuais da análise de compras (JSON): ' + JSON.stringify(contexto) },
      { role: 'assistant', content: 'Entendido, já tenho os dados pra responder suas perguntas sobre eles.' },
      ...(Array.isArray(historico) ? historico.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: String(m.texto || '') })) : []),
      { role: 'user', content: String(pergunta) },
    ];
    const resultado = await chamarClaude(env, mensagens);
    return respostaJson(resultado);
  }

  return respostaJson({ ok: false, erro: 'acao desconhecida: ' + acao });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method === 'POST') {
      return handleIA(request, env);
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
