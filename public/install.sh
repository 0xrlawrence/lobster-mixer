#!/bin/bash

# Lobster Mix Installer

echo "🦞 Installing Lobster CLI..."

INSTALL_DIR="$HOME/.lobster/bin"
mkdir -p "$INSTALL_DIR"

# Download the CLI script
# In a real scenario this would fetch from a CDN or released binary. 
# For this demo/local setup, we assume we are fetching from the served public dir.
# We'll use the current host if executed via curl pipe, or default to localhost.

# Attempt to detect the sourced URL or default
LOBSTER_URL="http://localhost:4321/lobster.js"

curl -sL "$LOBSTER_URL" -o "$INSTALL_DIR/lobster"
chmod +x "$INSTALL_DIR/lobster"

# Add to PATH if not present
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$HOME/.bashrc"
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$HOME/.zshrc"
    export PATH="$PATH:$INSTALL_DIR"
fi

echo ""
echo "✅ Installed successfully!"
echo "Try running: lobster status"
