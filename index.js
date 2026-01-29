import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Teste se o servidor está vivo
app.get("/", (req, res) => {
  res.send("TireStore BOT rodando 🚀");
});

// Verificação do webhook (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// Enviar menu
async function sendMenu(to) {
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "TireStore 🛞"
        },
        body: {
          text: "Como podemos te ajudar?"
        },
        footer: {
          text: "Escolha uma opção"
        },
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
}

// Receber mensagens
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body;

    console.log("Mensagem recebida:", from, text);

    // Sempre responde com o menu
    if (text) {
      await sendMenu(from);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err?.response?.data || err);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
