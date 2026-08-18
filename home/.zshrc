# PATH
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export PATH="$HOME/.local/opt/go/bin:$PATH"
export PATH="$HOME/Library/pnpm:$PATH"

# Environment
export EDITOR=nvim
export STARSHIP_CONFIG="$HOME/.config/starship.toml"
export GIT_CONFIG_GLOBAL="$HOME/.config/git/config"
export BUN_INSTALL="$HOME/.bun"
export PNPM_HOME="$HOME/Library/pnpm"
export LOCALHOST_KEY="$HOME/.certs/localhost-key.pem"
export LOCALHOST_CERT="$HOME/.certs/localhost.pem"

# fnm
FNM_PATH="/Users/santidalmasso/Library/Application Support/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="/Users/santidalmasso/Library/Application Support/fnm:$PATH"
  eval "`fnm env`"
fi

# Tools
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
eval "$(atuin init zsh)"
eval "$(fnm env --use-on-cd --shell zsh)"

# Plugins
source "$(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"
[ -s "$HOME/.config/envman/load.sh" ] && source "$HOME/.config/envman/load.sh"
[ -s "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env"

# Key bindings
bindkey '^w' autosuggest-execute
bindkey '^e' autosuggest-accept
bindkey '^u' autosuggest-toggle
bindkey '^L' vi-forward-word
bindkey '^k' up-line-or-search
bindkey '^j' down-line-or-search

# Navigation
alias ..="cd .."
alias ...="cd ../.."
alias ....="cd ../../.."
alias .....="cd ../../../.."

# Eza
alias ls="eza"
alias ll="eza -l"
alias la="eza -la"
alias l="eza -l --icons --git -a"
alias lt="eza --tree --level=2 --long --icons --git"
alias ltree="eza --tree --level=2 --icons --git"

# Aliases
alias search="fzf --preview 'bat --color=always --style=numbers --line-range=:500 {}' | xargs nvim"
alias python="python3"
export GIT_CONFIG_GLOBAL=~/.config/git/config

export LOCALHOST_KEY="$HOME/.certs/localhost-key.pem"
export LOCALHOST_CERT="$HOME/.certs/localhost.pem"

# Completions
autoload -Uz compinit && compinit -C
