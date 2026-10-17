# dotfiles

## Install

```bash
git clone https://github.com/santidalmasso/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./setup.sh
```

## Agent skills

Public skills live in `home/.agents/skills/`, stowed to `~/.agents/skills` and linked into `~/.claude/skills` by `setup.sh`. Both Claude Code and pi read them.

Private skills go in `~/.agents/skills-private/<name>/SKILL.md`, outside this repo. Run `sync-skills` after pulling or adding a skill. It links every public and private skill into both harnesses, prunes dead links, and keeps private names out of `git status` through `.git/info/exclude`.
