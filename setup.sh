#!/bin/bash
set -e

# Init node via fnm; this script runs under bash and never sources .zshrc
setup_node() {
  echo "Setting up node via fnm..."
  eval "$(fnm env --shell bash)"
  fnm use --install-if-missing lts-latest
}

# Reinstall skills that have an upstream source; local ones arrive via stow
install_skills() {
  local lock="$HOME/.agents/.skill-lock.json" entries
  echo "Installing agent skills..."
  entries=$(awk -F'"' '/^    ".*": \{$/ {n=$2} /^      "source": / {print $4, n}' "$lock" 2>/dev/null || true)
  if [ -z "$entries" ]; then
    echo "  warning: parsed no skills from $lock (format changed?); skipping"
    return
  fi
  echo "$entries" | while read -r repo skill; do
    npx -y skills@latest add -g "$repo" --skill "$skill" -y || true
  done
}

echo "Setting up dotfiles..."

# Install Homebrew if not present
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Trust third-party taps; brew refuses to load their formulae/casks otherwise
echo "Trusting third-party taps..."
brew trust --tap docker/tap nikitabobko/tap tw93/tap

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
mkdir -p "$HOME/.config/herdr/plugins"
stow home -t ~

echo "Building and linking herdr plugins..."
cargo build --release --manifest-path "$HOME/.config/herdr/plugins/attention-router/Cargo.toml"
herdr plugin link "$HOME/.config/herdr/plugins/attention-router"
herdr plugin install paulbkim-dev/vim-herdr-navigation --yes

setup_node
install_skills

# Link public and private skills into both harnesses; rerun `sync-skills` any time
chmod +x "$HOME/.local/bin/sync-skills"
"$HOME/.local/bin/sync-skills"

# Make scripts executable
echo "Making scripts executable..."
chmod +x "$HOME/.local/bin/"* 2>/dev/null || true

echo "Done! Restart terminal or run: source ~/.zshrc"
