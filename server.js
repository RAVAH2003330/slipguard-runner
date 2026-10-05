import express from "express";
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SLIPGUARD_API = "https://slipguard-backend.onrender.com/api/v1/verify-slip";

let currentQR = null;
let botStatus = "Disconnected";
let activeApiKey = process.env.API_KEY || "";
let sock = null;

// Settings සුරැකීමට
if (fs.existsSync("config.json")) {
    try {
        const conf = JSON.parse(fs.readFileSync("config.json"));
        activeApiKey = conf.apiKey || activeApiKey;
    } catch (e) {}
}

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");

    sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    getMessage: async (key) => {
        return {
            conversation: ""
        };
    }
});

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = await QRCode.toDataURL(qr);
            botStatus = "QR Ready - Scan Now";
        }

        if (connection === "close") {
            currentQR = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            botStatus = shouldReconnect ? "Reconnecting..." : "Logged Out";
            if (shouldReconnect) startWhatsApp();
        } else if (connection === "open") {
            currentQR = null;
            botStatus = "Connected & Active 24/7";
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isImage = msg.message.imageMessage;

        if (isImage) {
            if (!activeApiKey) {
                console.log("[Warn] Slip received but no API Key configured.");
                return;
            }

            try {
                await sock.sendMessage(sender, { 
                    text: "⏳ ඔබගේ බැංකු රිසිට්පත පරීක්ෂා කෙරෙමින් පවතී. කරුණාකර රැඳී සිටින්න..." 
                }, { quoted: msg });

                const buffer = await downloadMediaMessage(msg, "buffer", {});

                const formData = new FormData();
                formData.append("order_id", "WA_" + Date.now());
                formData.append("expected_amount", "0");
                formData.append("slip_file", buffer, {
                    filename: "slip.jpg",
                    contentType: "image/jpeg"
                });

                const res = await axios.post(SLIPGUARD_API, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        "X-API-KEY": activeApiKey
                    },
                    timeout: 60000
                });

                const result = res.data;

                if (result.verdict === "CLEAN / LOW RISK" && result.risk_score <= 45) {
                    const text = `✅ *ගෙවීම් රිසිට්පත තහවුරු විය!*\n\n` +
                                 `🏦 බැංකුව: ${result.bank_name || "හඳුනාගෙන ඇත"}\n` +
                                 `💰 මුදල: රු. ${result.detected_amount || "0.00"}\n` +
                                 `🔢 Ref ID: ${result.reference_number || "හඳුනාගෙන ඇත"}\n\n` +
                                 `ස්තූතියි! ඔබගේ ඇණවුම ඉදිරියට ක්‍රියාත්මක කෙරේ.`;
                    await sock.sendMessage(sender, { text }, { quoted: msg });
                } else {
                    const text = `⚠️ *රිසිට්පත තහවුරු කිරීමට නොහැකි විය!*\n\n` +
                                 `හේතුව: රිසිට්පත අපැහැදිලි වීම හෝ වලංගු නොවීම විය හැක.\n` +
                                 `කරුණාකර පැහැදිලි මුල් බැංකු රිසිට්පතක් නැවත යොමු කරන්න.`;
                    await sock.sendMessage(sender, { text }, { quoted: msg });
                }
            } catch (err) {
                console.error("API error:", err.response?.data || err.message);
                if (err.response?.status === 402) {
                    await sock.sendMessage(sender, { 
                        text: "⚠️ Verification පද්ධතියේ Credits අවසන්ව ඇත. කරුණාකර Administrator අමතන්න." 
                    }, { quoted: msg });
                }
            }
        }
    });
}

app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>SlipGuard WhatsApp Runner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2rem; border-radius: 12px; width: 100%; max-width: 400px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
            h2 { margin-top: 0; color: #38bdf8; }
            .status { font-weight: bold; padding: 8px; border-radius: 6px; margin: 15px 0; background: #334155; }
            .connected { background: #15803d; color: #fff; }
            input[type="text"] { width: 90%; padding: 10px; margin: 10px 0; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #fff; text-align: center; }
            button { background: #0284c7; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 95%; margin-top: 5px; }
            button:hover { background: #0369a1; }
            .qr-box { margin-top: 20px; min-height: 250px; display: flex; justify-content: center; align-items: center; background: #fff; padding: 10px; border-radius: 8px; }
            .qr-box img { max-width: 100%; height: auto; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>SlipGuard Runner</h2>
            <div id="status" class="status">${botStatus}</div>
            
            <form id="keyForm">
                <input type="text" id="apiKey" placeholder="Enter SlipGuard API Key" value="${activeApiKey}" required />
                <button type="submit">Save API Key</button>
            </form>

            <div class="qr-box" id="qrContainer">
                ${currentQR ? `<img src="${currentQR}" alt="WhatsApp QR" />` : `<span style="color:#000;">${botStatus === "Connected & Active 24/7" ? "✅ Bot is Connected!" : "Generating QR Code..."}</span>`}
            </div>
        </div>

        <script>
            document.getElementById('keyForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const key = document.getElementById('apiKey').value;
                await fetch('/api/set-key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ apiKey: key })
                });
                alert('API Key Updated Successfully!');
            });

            setInterval(async () => {
                const res = await fetch('/api/status');
                const data = await res.json();
                const statusDiv = document.getElementById('status');
                statusDiv.innerText = data.status;
                if (data.status.includes('Connected')) {
                    statusDiv.className = 'status connected';
                } else {
                    statusDiv.className = 'status';
                }

                const qrBox = document.getElementById('qrContainer');
                if (data.qr) {
                    qrBox.innerHTML = '<img src="' + data.qr + '" alt="WhatsApp QR" />';
                } else if (data.status.includes('Connected')) {
                    qrBox.innerHTML = '<span style="color:#000; font-weight:bold;">✅ WhatsApp Bot is Active!</span>';
                }
            }, 3000);
        </script>
    </body>
    </html>
    `);
});

app.get("/api/status", (req, res) => {
    res.json({ status: botStatus, qr: currentQR });
});

app.post("/api/set-key", (req, res) => {
    activeApiKey = req.body.apiKey || "";
    fs.writeFileSync("config.json", JSON.stringify({ apiKey: activeApiKey }));
    console.log("[Config] Updated API Key to:", activeApiKey);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Web Dashboard running on port ${PORT}`);
    startWhatsApp();
});
