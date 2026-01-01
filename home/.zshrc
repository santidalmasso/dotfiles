
# fnm
FNM_PATH="/Users/santidalmasso/Library/Application Support/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="/Users/santidalmasso/Library/Application Support/fnm:$PATH"
  eval "`fnm env`"
fi

source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
bindkey '^w' autosuggest-execute
bindkey '^e' autosuggest-accept
bindkey '^u' autosuggest-toggle
bindkey '^L' vi-forward-word
bindkey '^k' up-line-or-search
bindkey '^j' down-line-or-search

eval "$(fnm env --use-on-cd --shell zsh)"
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
eval "$(atuin init zsh)"

# Aliases
alias search="fzf --preview 'bat --color=always --style=numbers --line-range=:500 {}' | xargs nvim"
alias ll="ls -l"

alias python=python3

# Dirs
alias ..="cd .."
alias ...="cd ../.."
alias ....="cd ../../.."
alias .....="cd ../../../.."
alias ......="cd ../../../../.."

# Eza
alias ls="eza"
alias ll="eza -l"
alias la="eza -la"
alias l="eza -l --icons --git -a"
alias lt="eza --tree --level=2 --long --icons --git"
alias ltree="eza --tree --level=2  --icons --git"

. "$HOME/.local/bin/env"

# bun completions
[ -s "/Users/santidalmasso/.bun/_bun" ] && source "/Users/santidalmasso/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Generated for envman. Do not edit.
[ -s "$HOME/.config/envman/load.sh" ] && source "$HOME/.config/envman/load.sh"
export PATH=$PATH:$HOME/.local/opt/go/bin

export STARSHIP_CONFIG=~/.config/starship.toml
export EDITOR=nvim
export GIT_CONFIG_GLOBAL=~/.config/git/config

# Added by Antigravity
export PATH="/Users/santidalmasso/.antigravity/antigravity/bin:$PATH"

export LOCALHOST_KEY="$HOME/.certs/localhost-key.pem"
export LOCALHOST_CERT="$HOME/.certs/localhost.pem"
