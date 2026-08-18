#!/bin/bash
set -e

echo "Setting up dotfiles..."

# Install Homebrew if not present
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Install dependencies
echo "Installing packages..."
brew bundle --file="$(dirname "$0")/Brewfile"

# Install gh extensions (no brew formulae exist for these)
echo "Installing gh extensions..."
gh extension install dlvhdr/gh-dash || true
gh extension install github/gh-stack || true

# Create symlinks
echo "Creating symlinks..."
cd "$(dirname "$0")"
stow home -t ~

# Make scripts executable
echo "Making scripts executable..."
chmod +x "$HOME/.local/bin/"* 2>/dev/null || true

echo "Done! Restart terminal or run: source ~/.zshrc"
