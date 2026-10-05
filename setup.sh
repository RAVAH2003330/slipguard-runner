#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Installing SlipGuard WhatsApp Runner..."
echo "=========================================="

# 1. System packages update
sudo apt-get update -y
sudo apt-get install -y curl git build-essential

# 2. Node.js 18 installation
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. PM2 installation
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 process manager..."
    sudo npm install -g pm2
fi

# 4. Clone or update repository
APP_DIR="whatsapp-slip-runner"
if [ -d "$APP_DIR" ]; then
    echo "🔄 Updating existing repository..."
    cd "$APP_DIR"
    git pull
else
    echo "📥 Cloning runner code..."
    git clone https://github.com/RAVAH2003330/slipguard-runner.git "$APP_DIR"
    cd "$APP_DIR"
fi

# 5. Dependencies install
echo "📦 Installing project dependencies..."
npm install

# 6. Firewall rule for Port 3000
if command -v ufw &> /dev/null; then
    sudo ufw allow 3000/tcp > /dev/null 2>&1 || true
fi

# 7. Start runner with PM2
echo "⚙️ Starting background service..."
pm2 stop slip-runner 2>/dev/null || true
pm2 delete slip-runner 2>/dev/null || true
pm2 start server.js --name "slip-runner"
pm2 save

SERVER_IP=$(curl -s -m 5 https://api.ipify.org || curl -s -m 5 ifconfig.me || echo "YOUR_VPS_IP")

echo "=========================================="
echo "✅ SlipGuard Runner Installed Successfully!"
echo "👉 Web Dashboard: http://${SERVER_IP}:3000"
echo "=========================================="