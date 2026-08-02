#!/bin/bash
# First-boot setup for a fresh BridgeOnline t4g.medium host (Amazon Linux 2023 ARM).
# Run as root after SSM:  sudo -i  then  bash /tmp/setup-bridgeonline.sh
# Fill EIP / Redis / secrets from: aws cloudformation describe-stacks ...
set -euxo pipefail

dnf update -y
dnf install -y docker git jq
systemctl enable --now docker

# Swap (safety net even on 4GB)
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Node 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs
npm install -g pm2

# Caddy (ARM64)
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /usr/local/bin/caddy
chmod +x /usr/local/bin/caddy
mkdir -p /etc/caddy
cat >/etc/caddy/Caddyfile <<'EOF'
:80 {
  reverse_proxy 127.0.0.1:3000
}
EOF
cat >/etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network.target
[Service]
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now caddy

echo "=== Next: set EIP, REDIS_ENDPOINT, secrets, then clone app (see docs) ==="
