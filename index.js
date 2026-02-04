import express from "express";
import axios from "axios";
import dotenv from "dotenv";

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

app.get("/", (req, res) => {
  res.send("VERSAO NOVA FINAL — 2026-02-04 A ✅");
});

// Verificação do webhook (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Tentativa de verificação do Webhook...");
  console.log("Recebido -> Mode:", mode, "| Token:", token);
  console.log("Esperado -> Verify Token:", VERIFY_TOKEN);

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
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
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

    console.log(`Enviando menu para: ${to}`);

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
              "MENU NOVO — 2026-02-04 A ✅\n\n" +
              "Olá! Somos a TireStore 🛞\n" +
              "Me diga o que você está buscando:",
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

    console.log("Menu enviado com sucesso! 📤");
  } catch (error) {
    console.error("ERRO AO ENVIAR MENU:", error.response?.data || error.message);
  }
}

// Receber mensagens
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("Webhook recebido: ", JSON.stringify(body, null, 2));

  if (body.object !== "whatsapp_business_account") return res.sendStatus(404);

  const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  const type = msg.type;

  console.log("Mensagem detectada de:", from, "| Tipo:", type);

  if (type === "text") {
    await sendMenu(from);
    return res.sendStatus(200);
  }

  if (type === "interactive") {
    const choice =
      msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;

    console.log("Cliente clicou:", choice);

    if (choice === "buy") {
      await sendText(from, "Show! Me mande a medida do pneu.");
    } else {
      await sendText(from, "Opção recebida: " + choice);
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Servidor ativo e aguardando na porta", PORT);
});
