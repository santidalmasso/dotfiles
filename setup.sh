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

# Create symlinks
echo "Creating symlinks..."
cd "$(dirname "$0")"
stow home -t ~

echo "Done! Restart terminal or run: source ~/.zshrc"
