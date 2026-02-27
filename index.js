import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

dotenv.config();

console.log("🚀 SUBIU VERSAO NOVA FINAL — 2026-02-04 A ✅ (ORÇAMENTO + RESET 24H)");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

console.log("=== Configuração do Bot ===");
console.log("Porta:", PORT);
console.log("Verify Token configurado:", VERIFY_TOKEN ? "SIM ✅" : "NÃO ❌");
console.log("WhatsApp Token configurado:", WHATSAPP_TOKEN ? "SIM ✅" : "NÃO ❌");
console.log("Phone ID:", PHONE_NUMBER_ID);
console.log("===========================");

// ✅ sleep compatível com qualquer versão
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Memória alterada para suportar objeto: from -> { step, lastInteraction }
const sessions = new Map(); 

app.get("/", (req, res) => {
  res.send("VERSAO NOVA FINAL — 2026-02-04 A ✅ (ORÇAMENTO + RESET 24H)");
});

// Verificação do webhook (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFICADO COM SUCESSO! ✅");
    return res.status(200).send(challenge);
  }

  console.log("FALHA NA VERIFICAÇÃO DO WEBHOOK! ❌");
  return res.sendStatus(403);
});

// Enviar texto simples
async function sendText(to, text) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    await axios.post(
      url,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("ERRO AO ENVIAR TEXTO:", error.response?.data || error.message);
  }
}

// Enviar menu
async function sendMenu(to) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "TireStore" },
          body: { text: "Olá! Somos a TireStore 🛞\n\nComo podemos te ajudar hoje?" },
          footer: { text: "Escolha uma opção" },
          action: {
            button: "Ver opções",
            sections: [
              {
                title: "Atendimento",
                rows: [
                  { id: "buy", title: "Comprar pneus" },
                  { id: "after", title: "Pós-venda" },
                  { id: "track", title: "Rastreamento"},
                ],
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("ERRO AO ENVIAR MENU:", error.response?.data || error.message);
  }
}

// ✅ Helpers Horário - Verifica se está entre Seg-Sex 08:00-18:00 (Fuso SP)
function isWorkHours() {
  const agora = new Date();
  const brasiliaTime = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  const dia = brasiliaTime.getDay(); // 0 = Domingo, 6 = Sábado
  const hora = brasiliaTime.getHours();

  const diaUtil = dia >= 1 && dia <= 5;
  const horaUtil = hora >= 8 && hora < 18;

  return diaUtil && horaUtil;
}

// ✅ Helpers URL/site
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
    const largura = parts.find(p => p.length === 3);
    const outros = parts.filter(p => p !== largura);
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
  const isGarbage = h.includes("/pesquisa") || h.includes("#/") || h.includes("marca-") || h.includes("limpar") || h.includes("filtro") || h.includes("filters");
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
    const url = c.href.startsWith("http") ? c.href : `https://www.tirestore.com.br${c.href.startsWith("/") ? "" : "/"}${c.href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const a = $(`a[href="${c.href}"]`).first();
    const blockText = a.parent().text().replace(/\s+/g, " ").trim();
    const m = blockText.match(/R\$\s?\d{1,3}(?:\.\d.3})*,\d{2}/);
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process", "--no-zygote"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(8000);

    const products = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const isProductUrl = (url) => {
        if (!url) return false;
        const u = url.toLowerCase();
        return (u.includes("/p/") || u.includes("/produto") || u.includes("/product")) && 
                !(u.includes("/pesquisa") || u.includes("#/") || u.includes("filtro"));
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
    msg += `🌙 No momento estamos fora do nosso horário de atendimento (Seg a Sex, 08h às 18h).\n\n` +
            `✅ Assim que nossa equipe retornar, um atendente finalizará seu orçamento prioritariamente!`;
  }

  return msg;
}

// Webhook principal
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object !== "whatsapp_business_account") return res.sendStatus(404);
  const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  const type = msg.type;
  const now = Date.now();

  // 1️⃣ LOGICA DE RESET 24H
  const session = sessions.get(from);
  if (session && session.lastInteraction) {
      const vinteEQuatroHoras = 24 * 60 * 60 * 1000;
      if (now - session.lastInteraction > vinteEQuatroHoras) {
          sessions.delete(from); // Apaga a sessão antiga
          console.log(`Sessão de ${from} resetada por inatividade de 24h.`);
      }
  }

  // Pega a sessão atualizada após o reset
  const currentSession = sessions.get(from);

  // 🛑 TRAVA DE PAUSA: Se estiver pausado, o bot não responde nada
  if (currentSession?.step === "PAUSED") return res.sendStatus(200);

  if (type === "text") {
    const text = (msg.text?.body || "").trim();

    // ✅ Lógica para Orçamento
    if (currentSession?.step === "WAIT_SIZE") {
      sessions.set(from, { step: "PAUSED", lastInteraction: now }); // ✅ PAUSA AQUI
      const sizeNormalized = normalizeSize(text); 
      const searchUrl = buildSearchUrl(sizeNormalized);

      try {
        const html = await fetchHtml(searchUrl);
        let products = extractProductsFromHtml(html);
        if (!products.length) products = await fetchProductsWithPuppeteer(searchUrl);

        await sendText(from, formatBudget(sizeNormalized, products, searchUrl));
        return res.sendStatus(200);
      } catch (e) {
        await sendText(from, `Não consegui consultar o site agora.\n\nVeja a busca aqui:\n${searchUrl}\n\n✅ Vou passar para um atendente finalizar com você.`);
        return res.sendStatus(200);
      }
    }

    // ✅ Lógica para Rastreamento
    if (currentSession?.step === "WAIT_TRACKING") {
      sessions.set(from, { step: "PAUSED", lastInteraction: now }); // ✅ PAUSA AQUI
      if (isWorkHours()) {
        await sendText(from, "Recebi as informações! 📝 Estou localizando seu pedido agora.\n\n⏳ Um atendente já te passa o status.");
      } else {
        await sendText(from, "Recebi suas informações de rastreio! 📝\n\n🌙 No momento estamos fora do horário comercial. Assim que retornarmos, te responderemos primeiro!");
      }
      return res.sendStatus(200);
    }

    // ✅ Lógica para Pós-venda
    if (currentSession?.step === "WAIT_AFTER_SALES") {
      sessions.set(from, { step: "PAUSED", lastInteraction: now }); // ✅ PAUSA AQUI
      if (isWorkHours()) {
        await sendText(from, "Entendido! Já anotei sua dúvida. 📝\n\n⏳ Um atendente já vai te responder!");
      } else {
        await sendText(from, "Entendido! Já registrei seu relato. 📝\n\n🌙 Retornaremos em breve para te auxiliar prioritariamente!");
      }
      return res.sendStatus(200);
    }

    await sendMenu(from);
    return res.sendStatus(200);
  }

  if (type === "interactive") {
    const choice = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;
    
    if (choice === "buy") {
      sessions.set(from, { step: "WAIT_SIZE", lastInteraction: now });
      await sendText(from, "Excelente escolha. Informe a medida do pneu (ex: 175/70 R13) para que eu consulte as opções disponíveis.");
      return res.sendStatus(200);
    }

    if (choice === "track") {
      sessions.set(from, { step: "WAIT_TRACKING", lastInteraction: now });
      await sendText(from, "Me envia o número do pedido ou CPF do titular que eu verifico o status pra você rapidinho 🚚💨");
      return res.sendStatus(200);
    }

    if (choice === "after") {
      sessions.set(from, { step: "WAIT_AFTER_SALES", lastInteraction: now });
      await sendText(from, "Estamos aqui para ajudar com sua compra! 👋\n\nPor favor, escreva sua dúvida ou o problema que está enfrentando.");
      return res.sendStatus(200);
    }

    await sendText(from, "Opção recebida: " + choice);
    return res.sendStatus(200);
  }
  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Servidor ativo e aguardando na porta", PORT);
});