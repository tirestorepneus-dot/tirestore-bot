import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Pega as variáveis do Railway ou do .env local
const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// LOG DE DIAGNÓSTICO: Isso vai aparecer no seu Deploy Log do Railway
console.log("=== Configuração do Bot ===");
console.log("Porta:", PORT);
console.log("Verify Token configurado:", VERIFY_TOKEN ? "SIM ✅" : "NÃO ❌");
console.log("WhatsApp Token configurado:", WHATSAPP_TOKEN ? "SIM ✅" : "NÃO ❌");
console.log("Phone ID:", PHONE_NUMBER_ID);
console.log("===========================");

// Teste se o servidor está vivo
app.get("/", (req, res) => {
  res.send("TireStore BOT rodando 🚀");
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
          header: { type: "text", text: "TireStore 🛞" },
          body: { text: "Como podemos te ajudar?" },
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
                  { id: "cancel", title: "Cancelamento", description: "Cancelar pedido" }
                ]
              }
            ]
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
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

  // Log para ver o que a Meta está enviando exatamente
  console.log("Webhook recebido: ", JSON.stringify(body, null, 2));

  if (body.object === "whatsapp_business_account") {
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg) {
      const from = msg.from;
      const text = msg.text?.body;

      console.log("Mensagem detectada de:", from, "| Texto:", text);

      if (text) {
        await sendMenu(from);
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

app.listen(PORT, () => {
  console.log("Servidor ativo e aguardando na porta", PORT);
});