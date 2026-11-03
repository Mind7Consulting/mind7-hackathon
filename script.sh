#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update

# -------------------------------------------------
# 1. Git et outils de base
# -------------------------------------------------
apt-get install -y \
    git \
    curl \
    ca-certificates \
    gnupg

# -------------------------------------------------
# 2. Java 17
# -------------------------------------------------
apt-get install -y openjdk-17-jdk

# -------------------------------------------------
# 3. Python 3
# -------------------------------------------------
apt-get install -y \
    python3 \
    python3-pip \
    python3-requests

# -------------------------------------------------
# 4. Interface graphique + RDP
# -------------------------------------------------
apt-get install -y \
    cinnamon-desktop-environment \
    xrdp \
    ssl-cert

adduser xrdp ssl-cert || true

# Session par défaut pour les futurs utilisateurs
echo "cinnamon-session" > /etc/skel/.xsession

# Configuration des utilisateurs déjà existants
for user_home in /home/*; do
    if [ -d "$user_home" ]; then
        user=$(basename "$user_home")

        echo "cinnamon-session" > "$user_home/.xsession"
        chown "$user:$user" "$user_home/.xsession"
    fi
done

systemctl enable xrdp
systemctl restart xrdp

# -------------------------------------------------
# 5. IntelliJ IDEA Community
# -------------------------------------------------
if command -v snap >/dev/null 2>&1; then
    snap install intellij-idea-community --classic
else
    echo "ERREUR : snap n'est pas installé sur cette VM."
    exit 1
fi

echo "========================================"
echo "Installation terminée avec succès."
echo "Redémarrage de la VM recommandé."
echo "========================================"