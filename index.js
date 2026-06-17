import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

dotenv.config();

console.log("🚀 SUBIU VERSAO CHATWOOT — Bot integrado via Agent Bot ✅");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL; // ex: https://app.chatwoot.com
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID; // numero da conta, fica na URL do painel
const CHATWOOT_BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN; // token gerado ao criar o Agent Bot

console.log("=== Configuração do Bot ===");
console.log("Porta:", PORT);
console.log("Chatwoot URL:", CHATWOOT_BASE_URL);
console.log("Account ID:", CHATWOOT_ACCOUNT_ID);
console.log("Bot Token configurado:", CHATWOOT_BOT_TOKEN ? "SIM ✅" : "NÃO ❌");
console.log("===========================");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sessões por conversation_id do Chatwoot (ainda em memória — trocar por banco/Redis assim que possível)
const sessions = new Map();

app.get("/", (req, res) => {
  res.send("Bot TireStore rodando — integrado via Chatwoot Agent Bot ✅");
});

// ---------- Helpers de comunicação com o Chatwoot ----------

function chatwootHeaders() {
  return {
    api_access_token: CHATWOOT_BOT_TOKEN,
    "Content-Type": "application/json",
  };
}

async function sendMessage(conversationId, content) {
  try {
    const url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`;
    await axios.post(
      url,
      { content, message_type: "outgoing", private: false },
      { headers: chatwootHeaders() }
    );
  } catch (error) {
    console.error("ERRO AO ENVIAR MENSAGEM (Chatwoot):", error.response?.data || error.message);
  }
}

async function handoffToHuman(conversationId) {
  try {
    const url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/toggle_status`;
    await axios.post(url, { status: "open" }, { headers: chatwootHeaders() });
    console.log(`Conversa ${conversationId} repassada para atendente humano.`);
  } catch (error) {
    console.error("ERRO AO FAZER HANDOFF:", error.response?.data || error.message);
  }
}

// ---------- Menu (agora em texto simples, mais confiável via Chatwoot) ----------

async function sendMenu(conversationId) {
  const texto =
    "Olá! Somos a TireStore 🛞\n\n" +
    "Como podemos te ajudar hoje? Responda com o número da opção:\n\n" +
    "1️⃣ Comprar pneus\n" +
    "2️⃣ Pós-venda\n" +
    "3️⃣ Rastreamento";
  await sendMessage(conversationId, texto);
}

// ---------- Helpers de horário e busca (lógica igual à versão anterior) ----------

function isWorkHours() {
  const agora = new Date();
  const brasiliaTime = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = brasiliaTime.getDay();
  const hora = brasiliaTime.getHours();
  const diaUtil = dia >= 1 && dia <= 5;
  const horaUtil = hora >= 8 && hora < 18;
  return diaUtil && horaUtil;
}

function normalizeSize(input) {
  const numbersOnly = String(input || "").replace(/\D/g, "");

  if (numbersOnly.length === 7) {
    const largura = numbersOnly.substring(0, 3);
    const perfil = numbersOnly.substring(3, 5);
    const aro = numbersOnly.substring(5, 7);
    return `${largura}/${perfil}R${aro}`;
  }

  const parts = (input || "").match(/\d+/g);
  if (parts && parts.length >= 3) {
    const largura = parts.find((p) => p.length === 3);
    const outros = parts.filter((p) => p !== largura);
    if (largura && outros.length >= 2) {
      return `${largura}/${outros[0]}R${outros[1]}`;
    }
  }

  return String(input || "")
    .toLowerCase()
    .replace(/aro|pneu/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
}

function buildSearchUrl(size) {
  const q = normalizeSize(size);
  return `https://www.tirestore.com.br/pesquisa?t=${encodeURIComponent(q)}`;
}

async function fetchHtml(url) {
  const r = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    timeout: 20000,
  });
  return r.data;
}

function isProductHref(href) {
  const h = (href || "").toLowerCase();
  const looksLike = h.includes("/p/") || h.includes("/produto") || h.includes("/product");
  const isGarbage =
    h.includes("/pesquisa") ||
    h.includes("#/") ||
    h.includes("marca-") ||
    h.includes("limpar") ||
    h.includes("filtro") ||
    h.includes("filters");
  return looksLike && !isGarbage;
}

function extractProductsFromHtml(html) {
  const $ = cheerio.load(html);
  const candidates = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const name = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || name.length < 10) return;
    if (!isProductHref(href)) return;
    candidates.push({ href, name });
  });

  const seen = new Set();
  const products = [];
  for (const c of candidates) {
    const url = c.href.startsWith("http")
      ? c.href
      : `https://www.tirestore.com.br${c.href.startsWith("/") ? "" : "/"}${c.href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const a = $(`a[href="${c.href}"]`).first();
    const blockText = a.parent().text().replace(/\s+/g, " ").trim();
    const m = blockText.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/);
    const price = m ? m[0] : null;
    if (/comprar|ver|detalhes|saiba|clique|limpar/i.test(c.name)) continue;
    products.push({ name: c.name, url, price });
    if (products.length >= 6) break;
  }
  return products;
}

async function fetchProductsWithPuppeteer(searchUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(8000);

    const products = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const isProductUrl = (url) => {
        if (!url) return false;
        const u = url.toLowerCase();
        return (
          (u.includes("/p/") || u.includes("/produto") || u.includes("/product")) &&
          !(u.includes("/pesquisa") || u.includes("#/") || u.includes("filtro"))
        );
      };
      const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/produto"]'));
      for (const a of anchors) {
        const url = a.href;
        if (!isProductUrl(url)) continue;
        const name = (a.innerText || "").replace(/\s+/g, " ").trim();
        if (!name || name.length < 8) continue;
        const container = a.closest("article") || a.closest("li") || a.closest("div") || a.parentElement;
        const block = (container?.innerText || "").replace(/\s+/g, " ").trim();
        const m = block.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/);
        const price = m ? m[0] : null;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ name, url, price });
        if (out.length >= 6) break;
      }
      return out;
    });
    return products;
  } finally {
    await browser.close();
  }
}

function formatBudget(size, products, searchUrl) {
  let msg = `🛞 *TireStore — Orçamento para ${size}*\n\n`;

  if (!products.length) {
    msg += `Encontrei opções disponíveis para esta medida.\n\n`;
    msg += `🔎 Confira todas as marcas e modelos aqui:\n${searchUrl}\n\n`;
  } else {
    msg += `Encontrei estas opções no site:\n\n`;
    products.forEach((p, i) => {
      const priceLine = p.price ? `${p.price} cada` : "Preço no link";
      msg += `*${i + 1})* ${p.name}\n${priceLine}\n${p.url}\n\n`;
    });
  }

  if (isWorkHours()) {
    msg += `✅ Vou passar para um atendente finalizar seu orçamento.`;
  } else {
    msg +=
      `🌙 No momento estamos fora do nosso horário de atendimento (Seg a Sex, 08h às 18h).\n\n` +
      `✅ Assim que nossa equipe retornar, um atendente finalizará seu orçamento prioritariamente!`;
  }

  return msg;
}

// ---------- Webhook do Chatwoot (substitui o antigo webhook da Meta) ----------

app.post("/chatwoot-webhook", async (req, res) => {
  const body = req.body;

  // Só nos interessa: mensagem nova, enviada pelo cliente (não privada, não nossa própria resposta)
  if (body.event !== "message_created") return res.sendStatus(200);
  if (body.message_type !== "incoming") return res.sendStatus(200);
  if (body.private) return res.sendStatus(200);

  const conversationId = body.conversation?.id;
  const text = (body.content || "").trim();
  if (!conversationId) return res.sendStatus(200);

  const now = Date.now();

  // Reset de sessão por inatividade de 24h (igual lógica anterior)
  const existing = sessions.get(conversationId);
  if (existing?.lastInteraction && now - existing.lastInteraction > 24 * 60 * 60 * 1000) {
    sessions.delete(conversationId);
  }
  let currentSession = sessions.get(conversationId);

  // 🛠️ Comando manual de reset (útil pra testes)
  if (text.toLowerCase() === "resetar") {
    sessions.delete(conversationId);
    await sendMessage(conversationId, "🔄 Sessão resetada! Enviando menu inicial...");
    await sendMenu(conversationId);
    return res.sendStatus(200);
  }

  // ✅ Etapa: esperando medida do pneu (fluxo "comprar")
  if (currentSession?.step === "WAIT_SIZE") {
    sessions.delete(conversationId);
    const sizeNormalized = normalizeSize(text);
    const searchUrl = buildSearchUrl(sizeNormalized);

    try {
      const html = await fetchHtml(searchUrl);
      let products = extractProductsFromHtml(html);
      if (!products.length) products = await fetchProductsWithPuppeteer(searchUrl);
      await sendMessage(conversationId, formatBudget(sizeNormalized, products, searchUrl));
    } catch (e) {
      await sendMessage(
        conversationId,
        `Não consegui consultar o site agora.\n\nVeja a busca aqui:\n${searchUrl}\n\n✅ Vou passar para um atendente finalizar com você.`
      );
    }
    await handoffToHuman(conversationId);
    return res.sendStatus(200);
  }

  // ✅ Etapa: esperando dados de rastreamento
  if (currentSession?.step === "WAIT_TRACKING") {
    sessions.delete(conversationId);
    if (isWorkHours()) {
      await sendMessage(
        conversationId,
        "Recebi as informações! 📝 Estou localizando seu pedido agora.\n\n⏳ Um atendente já te passa o status."
      );
    } else {
      await sendMessage(
        conversationId,
        "Recebi suas informações de rastreio! 📝\n\n🌙 No momento estamos fora do horário comercial. Assim que retornarmos, te responderemos primeiro!"
      );
    }
    await handoffToHuman(conversationId);
    return res.sendStatus(200);
  }

  // ✅ Etapa: esperando dúvida de pós-venda
  if (currentSession?.step === "WAIT_AFTER_SALES") {
    sessions.delete(conversationId);
    if (isWorkHours()) {
      await sendMessage(conversationId, "Entendido! Já anotei sua dúvida. 📝\n\n⏳ Um atendente já vai te responder!");
    } else {
      await sendMessage(
        conversationId,
        "Entendido! Já registrei seu relato. 📝\n\n🌙 Retornaremos em breve para te auxiliar prioritariamente!"
      );
    }
    await handoffToHuman(conversationId);
    return res.sendStatus(200);
  }

  // Escolha do menu inicial (1, 2 ou 3 — ou palavra-chave)
  const escolha = text.toLowerCase();

  if (escolha === "1" || escolha.includes("comprar")) {
    sessions.set(conversationId, { step: "WAIT_SIZE", lastInteraction: now });
    await sendMessage(
      conversationId,
      "Excelente escolha. Vamos encontrar o pneu certo para o seu veículo.\n\n" +
        "Informe a medida do pneu (ex: 175/70 R13) para que eu consulte as opções disponíveis.\n\n" +
        "Também estamos disponíveis pelo telefone (11) 94036-2616 📞\n" +
        "Atendimento de segunda a sexta, das 8h às 18h."
    );
    return res.sendStatus(200);
  }

  if (escolha === "3" || escolha.includes("rastre")) {
    sessions.set(conversationId, { step: "WAIT_TRACKING", lastInteraction: now });
    await sendMessage(
      conversationId,
      "Animado pra rodar com seus pneus novos? Eu também ficaria! 😁🛞\n\n" +
        "Me envia o número do pedido ou CPF do titular que eu verifico o status pra você rapidinho 🚚💨\n\n" +
        "Já te atualizo se está chegando ou ainda em transporte 😉\n\n" +
        "Atendimento: seg a sex, das 8h às 18h."
    );
    return res.sendStatus(200);
  }

  if (escolha === "2" || escolha.includes("pós") || escolha.includes("pos venda") || escolha.includes("pós-venda")) {
    sessions.set(conversationId, { step: "WAIT_AFTER_SALES", lastInteraction: now });
    await sendMessage(
      conversationId,
      "Estamos aqui para ajudar com sua compra! 👋\n\nPor favor, escreva sua dúvida ou o problema que está enfrentando."
    );
    return res.sendStatus(200);
  }

  // Nenhuma opção reconhecida -> manda o menu de novo
  await sendMenu(conversationId);
  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Servidor ativo e aguardando na porta", PORT);
});