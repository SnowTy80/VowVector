#!/bin/bash
# Install Docker, NVIDIA Container Toolkit, and Node.js on Ubuntu/Pop!_OS
# Run with: sudo bash scripts/install-prereqs.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== VowVector: Installing Prerequisites ==="
echo ""

# --- Docker Engine ---
echo "[1/4] Installing Docker Engine..."

# Remove old packages
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
  apt-get remove -y "$pkg" 2>/dev/null || true
done

apt-get update -qq
apt-get install -y -qq ca-certificates curl

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

if [ -f /etc/os-release ]; then
  . /etc/os-release
fi
CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
if [ -z "$CODENAME" ] && command -v lsb_release >/dev/null 2>&1; then
  CODENAME="$(lsb_release -cs)"
fi
if [ -z "$CODENAME" ]; then
  CODENAME="noble"
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  ${CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
REAL_USER="${SUDO_USER:-$USER}"
usermod -aG docker "$REAL_USER"

echo "Docker installed: $(docker --version)"
echo ""

# --- NVIDIA Container Toolkit ---
echo "[2/4] Installing NVIDIA Container Toolkit..."

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

apt-get update -qq
apt-get install -y -qq nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

echo "NVIDIA Container Toolkit installed."
echo ""

# --- Node.js ---
echo "[3/4] Installing Node.js 22 LTS..."

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs

echo "Node.js installed: $(node --version)"
echo "npm installed: $(npm --version)"
echo ""

# --- vv CLI symlink ---
echo "[4/4] Installing vv CLI..."
REAL_USER="${SUDO_USER:-$USER}"
USER_HOME="$(eval echo "~$REAL_USER")"
BIN_DIR="$USER_HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$REPO_ROOT/vv" "$BIN_DIR/vv"
chown -h "$REAL_USER":"$REAL_USER" "$BIN_DIR/vv"
if ! grep -qs 'export PATH="$HOME/.local/bin:$PATH"' "$USER_HOME/.bashrc"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$USER_HOME/.bashrc"
fi
echo "vv installed at: $BIN_DIR/vv"
echo ""

# --- Verify ---
echo "=== Verification ==="
docker --version
docker compose version
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name --format=csv,noheader
else
  echo "nvidia-smi not found (GPU drivers not installed?)"
fi
node --version

echo ""
echo "=== Done! ==="
echo "Log out and back in (or run 'newgrp docker') for docker group to take effect."
echo "Then: source ~/.bashrc && cd <your-repo> && vv start"
