import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

dotenv.config();

console.log("🚀 SUBIU VERSAO NOVA FINAL — 2026-02-04 A");

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

// Memória simples por cliente
const sessions = new Map(); // from -> { step: "WAIT_SIZE" }

app.get("/", (req, res) => {
  res.send("VERSAO NOVA FINAL — 2026-02-04 A ✅");
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
          body: {
            text:
              "Olá! Somos a TireStore 🛞\n\n" +
              "Como podemos te ajudar hoje?",
          },
          footer: { text: "Escolha uma opção" },
          action: {
            button: "Ver opções",
            sections: [
              {
                title: "Atendimento",
                rows: [
                  { id: "buy", title: "Comprar pneus", description: "Orçamento por medida" },
                  { id: "after", title: "Pós-venda", description: "Suporte após compra" },
                  { id: "track", title: "Rastreamento", description: "Acompanhar pedido" },
                  { id: "return", title: "Troca ou devolução", description: "Solicitar troca" },
                  { id: "warranty", title: "Garantia", description: "Abrir chamado" },
                  { id: "cancel", title: "Cancelamento", description: "Cancelar pedido" },
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

// Helpers URL/site
function normalizeSize(input) {
  return String(input || "")
    .toLowerCase()
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

// Extrai produtos do HTML (heurístico)
function extractProductsFromHtml(html) {
  const $ = cheerio.load(html);

  const candidates = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const name = $(el).text().replace(/\s+/g, " ").trim();

    if (!href || name.length < 10) return;

    const looksLikeProduct =
      href.includes("/p/") ||
      href.includes("/produto") ||
      href.includes("/product") ||
      href.toLowerCase().includes("sku");

    if (looksLikeProduct) {
      candidates.push({ href, name });
    }
  });

  const seen = new Set();
  const products = [];

  for (const c of candidates) {
    const url = c.href.startsWith("http")
      ? c.href
      : `https://www.tirestore.com.br${c.href.startsWith("/") ? "" : "/"}${c.href}`;

    if (seen.has(url)) continue;
    seen.add(url);

    // tenta achar preço perto do link
    const a = $(`a[href="${c.href}"]`).first();
    const blockText = a.parent().text().replace(/\s+/g, " ").trim();
    const m = blockText.match(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/);
    const price = m ? m[0] : null;

    if (/comprar|ver|detalhes|saiba|clique/i.test(c.name)) continue;

    products.push({ name: c.name, url, price });
    if (products.length >= 6) break;
  }

  return products;
}

function formatBudget(size, products, searchUrl) {
  let msg = `🛞 *TireStore — Orçamento para ${size}*\n\n`;

  if (!products.length) {
    msg += `Encontrei a busca, mas não consegui listar automaticamente.\n\n`;
    msg += `Veja aqui:\n${searchUrl}\n\n`;
    msg += `✅ Vou passar para um atendente finalizar com você.`;
    return msg;
  }

  msg += `Encontrei estas opções no site:\n\n`;
  products.forEach((p, i) => {
    const priceLine = p.price ? `${p.price} cada` : "Preço no link";
    msg += `*${i + 1})* ${p.name}\n${priceLine}\n${p.url}\n\n`;
  });

  msg += `✅ Vou passar para um atendente finalizar com você.`;
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

  // Mensagem de texto
  if (type === "text") {
    const text = (msg.text?.body || "").trim();
    const session = sessions.get(from);

    // Se estiver esperando medida, gerar orçamento
    if (session?.step === "WAIT_SIZE") {
      sessions.delete(from);

      const size = text;
      const searchUrl = buildSearchUrl(size);

      try {
        const html = await fetchHtml(searchUrl);
        const products = extractProductsFromHtml(html);

        await sendText(from, formatBudget(size, products, searchUrl));
        return res.sendStatus(200);
      } catch (e) {
        console.log("Erro ao buscar site:", e.response?.status, e.message);
        await sendText(
          from,
          `Não consegui consultar o site agora.\n\nVeja a busca aqui:\n${searchUrl}\n\n✅ Vou passar para um atendente finalizar com você.`
        );
        return res.sendStatus(200);
      }
    }

    // Se não está esperando medida, manda o menu
    await sendMenu(from);
    return res.sendStatus(200);
  }

  // Clique no menu
  if (type === "interactive") {
    const choice =
      msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;

    if (choice === "buy") {
      sessions.set(from, { step: "WAIT_SIZE" });
      await sendText(from, "Show! Me mande a medida do pneu (ex: 175/70 R13).");
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
