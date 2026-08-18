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

# Link every skill into Claude Code; the CLI only links the ones it installs
link_skills() {
  local dir name target
  echo "Linking skills for Claude Code..."
  mkdir -p "$HOME/.claude/skills"
  for dir in "$HOME"/.agents/skills/*/; do
    name=$(basename "$dir")
    target="$HOME/.claude/skills/$name"
    [ -e "$target" ] || [ -L "$target" ] || ln -s "../../.agents/skills/$name" "$target"
  done
}

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

setup_node
install_skills
link_skills

# Make scripts executable
echo "Making scripts executable..."
chmod +x "$HOME/.local/bin/"* 2>/dev/null || true

echo "Done! Restart terminal or run: source ~/.zshrc"
