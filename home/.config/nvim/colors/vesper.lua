-- Vesper
-- Ported from the Vesper theme (Rauno Freiberg) to a Neovim colorscheme.

vim.opt.background = "dark"
vim.opt.termguicolors = true

if vim.g.colors_name then
  vim.cmd("highlight clear")
end
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end
vim.g.colors_name = "vesper"

local c = {
  bg0 = "#0A0A0A",
  bg1 = "#101010",
  bg2 = "#101010",
  bg3 = "#161616",
  bg4 = "#1A1A1A",
  bg5 = "#232323",
  bg6 = "#282828",
  selection = "#2D2D2D",
  fg0 = "#FFFFFF",
  fg1 = "#FFFFFF",
  fg2 = "#D4D4D4",
  fg3 = "#A0A0A0",
  fg4 = "#8E8E8E",
  fg5 = "#7E7E7E",
  comment = "#8B8B8B",
  gutter = "#505050",
  accent = "#FFC799",
  mint = "#99FFE4",
  red = "#f5a191",
  red2 = "#ff8080",
  yellow = "#e6b99d",
  blue = "#aca1cf",
  purple = "#b9aeda",
  magenta = "#e29eca",
  cyan = "#ea83a5",
}

local function hl(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

local function link(group, target)
  hl(group, { link = target })
end

-- Editor
hl("Normal", { fg = c.fg1, bg = c.bg2 })
hl("NormalNC", { fg = c.fg2, bg = c.bg2 })
hl("NormalFloat", { fg = c.fg2, bg = c.bg4 })
hl("FloatBorder", { fg = c.bg5, bg = c.bg4 })
hl("FloatTitle", { fg = c.accent, bg = c.bg4, bold = true })
hl("ColorColumn", { bg = c.bg3 })
hl("Conceal", { fg = c.fg5 })
hl("Cursor", { fg = c.bg1, bg = c.accent })
hl("CursorIM", { fg = c.bg1, bg = c.accent })
hl("CursorLine", { bg = c.bg3 })
hl("CursorColumn", { bg = c.bg3 })
hl("Directory", { fg = c.accent })
hl("EndOfBuffer", { fg = c.bg2 })
hl("ErrorMsg", { fg = c.red2 })
hl("Folded", { fg = c.fg4, bg = c.bg3 })
hl("FoldColumn", { fg = c.gutter, bg = c.bg2 })
hl("SignColumn", { fg = c.gutter, bg = c.bg2 })
hl("IncSearch", { fg = c.fg0, bg = "#575757" })
hl("Substitute", { fg = c.bg2, bg = c.accent })
hl("LineNr", { fg = c.gutter, bg = c.bg2 })
hl("CursorLineNr", { fg = c.fg0, bg = c.bg3 })
hl("MatchParen", { fg = c.fg0, bg = c.bg6, bold = true })
hl("ModeMsg", { fg = c.fg3 })
hl("MoreMsg", { fg = c.mint })
hl("NonText", { fg = c.gutter })
hl("Pmenu", { fg = c.fg2, bg = c.bg4 })
hl("PmenuSel", { fg = c.fg1, bg = c.bg6 })
hl("PmenuSbar", { bg = c.bg5 })
hl("PmenuThumb", { bg = c.selection })
hl("Question", { fg = c.accent })
hl("QuickFixLine", { fg = c.fg1, bg = c.bg5, bold = true })
hl("Search", { fg = c.fg0, bg = "#575757" })
hl("SpecialKey", { fg = c.gutter })
hl("SpellBad", { sp = c.red2, undercurl = true })
hl("SpellCap", { sp = c.blue, undercurl = true })
hl("SpellLocal", { sp = c.mint, undercurl = true })
hl("SpellRare", { sp = c.purple, undercurl = true })
hl("StatusLine", { fg = c.fg3, bg = c.bg0 })
hl("StatusLineNC", { fg = c.fg5, bg = c.bg0 })
hl("TabLine", { fg = c.fg3, bg = c.bg1 })
hl("TabLineFill", { bg = c.bg1 })
hl("TabLineSel", { fg = c.fg1, bg = c.bg3 })
hl("Title", { fg = c.accent, bold = true })
hl("Visual", { bg = c.selection })
hl("VisualNOS", { bg = c.selection })
hl("WarningMsg", { fg = c.accent })
hl("Whitespace", { fg = c.gutter })
hl("WildMenu", { fg = c.fg1, bg = c.bg6 })
hl("WinBar", { fg = c.fg3, bg = c.bg2 })
hl("WinBarNC", { fg = c.fg5, bg = c.bg2 })
hl("WinSeparator", { fg = c.bg5 })

-- Diffs / diagnostics / git
hl("DiffAdd", { fg = c.mint, bg = c.bg3 })
hl("DiffChange", { fg = c.accent, bg = c.bg3 })
hl("DiffDelete", { fg = c.red2, bg = c.bg3 })
hl("DiffText", { fg = c.fg0, bg = c.selection })
hl("DiagnosticError", { fg = c.red2 })
hl("DiagnosticWarn", { fg = c.accent })
hl("DiagnosticInfo", { fg = c.fg5 })
hl("DiagnosticHint", { fg = c.fg3 })
hl("DiagnosticOk", { fg = c.mint })
hl("DiagnosticUnderlineError", { sp = c.red2, undercurl = true })
hl("DiagnosticUnderlineWarn", { sp = c.accent, undercurl = true })
hl("DiagnosticUnderlineInfo", { sp = c.fg5, undercurl = true })
hl("DiagnosticUnderlineHint", { sp = c.fg3, undercurl = true })
hl("GitSignsAdd", { fg = c.mint, bg = c.bg2 })
hl("GitSignsChange", { fg = c.accent, bg = c.bg2 })
hl("GitSignsDelete", { fg = c.red2, bg = c.bg2 })

-- Syntax
hl("Comment", { fg = c.comment, italic = true })
hl("Constant", { fg = c.accent })
hl("String", { fg = c.mint })
hl("Character", { fg = c.mint })
hl("Number", { fg = c.accent })
hl("Boolean", { fg = c.accent })
hl("Float", { fg = c.accent })
hl("Identifier", { fg = c.fg1 })
hl("Function", { fg = c.accent })
hl("Statement", { fg = c.fg3 })
hl("Conditional", { fg = c.fg3 })
hl("Repeat", { fg = c.fg3 })
hl("Label", { fg = c.accent })
hl("Operator", { fg = c.fg3 })
hl("Keyword", { fg = c.fg3 })
hl("Exception", { fg = c.fg3 })
hl("PreProc", { fg = c.fg3 })
hl("Include", { fg = c.fg3 })
hl("Define", { fg = c.fg3 })
hl("Macro", { fg = c.accent })
hl("PreCondit", { fg = c.fg3 })
hl("Type", { fg = c.accent })
hl("StorageClass", { fg = c.fg3 })
hl("Structure", { fg = c.accent })
hl("Typedef", { fg = c.accent })
hl("Special", { fg = c.accent })
hl("SpecialChar", { fg = c.accent })
hl("Tag", { fg = c.accent })
hl("Delimiter", { fg = c.fg3 })
hl("SpecialComment", { fg = c.comment, italic = true })
hl("Debug", { fg = c.accent })
hl("Underlined", { fg = c.accent, underline = true })
hl("Ignore", { fg = c.fg5 })
hl("Error", { fg = c.fg0, bg = c.red2 })
hl("Todo", { fg = c.accent, bg = c.bg3, bold = true })

-- Treesitter
link("@comment", "Comment")
hl("@comment.documentation", { fg = c.comment, italic = true })
hl("@punctuation", { fg = c.fg3 })
hl("@punctuation.bracket", { fg = c.fg3 })
hl("@punctuation.delimiter", { fg = c.fg3 })
hl("@punctuation.special", { fg = c.accent })
hl("@string", { fg = c.mint })
hl("@string.documentation", { fg = c.comment })
hl("@string.escape", { fg = c.accent })
hl("@string.regexp", { fg = c.mint })
hl("@string.special", { fg = c.mint })
hl("@character", { fg = c.mint })
hl("@number", { fg = c.accent })
hl("@boolean", { fg = c.accent })
hl("@constant", { fg = c.accent })
hl("@constant.builtin", { fg = c.accent })
hl("@constant.macro", { fg = c.accent })
hl("@variable", { fg = c.fg1 })
hl("@variable.builtin", { fg = c.fg3 })
hl("@variable.parameter", { fg = c.fg1 })
hl("@variable.member", { fg = c.fg1 })
hl("@module", { fg = c.fg1 })
hl("@label", { fg = c.accent })
hl("@type", { fg = c.accent })
hl("@type.builtin", { fg = c.accent })
hl("@type.definition", { fg = c.accent })
hl("@attribute", { fg = c.fg3 })
hl("@property", { fg = c.fg1 })
hl("@function", { fg = c.accent })
hl("@function.builtin", { fg = c.accent })
hl("@function.call", { fg = c.accent })
hl("@function.macro", { fg = c.accent })
hl("@constructor", { fg = c.accent })
hl("@method", { fg = c.accent })
hl("@method.call", { fg = c.accent })
hl("@keyword", { fg = c.fg3 })
hl("@keyword.conditional", { fg = c.fg3 })
hl("@keyword.repeat", { fg = c.fg3 })
hl("@keyword.return", { fg = c.fg3 })
hl("@keyword.import", { fg = c.fg3 })
hl("@keyword.function", { fg = c.fg3 })
hl("@keyword.operator", { fg = c.fg3 })
hl("@operator", { fg = c.fg3 })
hl("@tag", { fg = c.accent })
hl("@tag.attribute", { fg = c.fg3 })
hl("@tag.delimiter", { fg = c.fg3 })
hl("@markup.heading", { fg = c.accent, bold = true })
hl("@markup.italic", { fg = c.fg0, italic = true })
hl("@markup.strong", { fg = c.fg0, bold = true })
hl("@markup.quote", { fg = c.fg4 })
hl("@markup.raw", { fg = c.mint })
hl("@markup.link", { fg = c.fg0, underline = true })
hl("@markup.list", { fg = c.fg3 })
hl("@diff.plus", { fg = c.mint })
hl("@diff.minus", { fg = c.red2 })
hl("@diff.delta", { fg = c.accent })

-- LSP semantic tokens
link("@lsp.type.comment", "@comment")
link("@lsp.type.enum", "@type")
link("@lsp.type.enumMember", "@constant")
link("@lsp.type.function", "@function")
link("@lsp.type.interface", "@type")
link("@lsp.type.keyword", "@keyword")
link("@lsp.type.macro", "@function.macro")
link("@lsp.type.method", "@method")
link("@lsp.type.namespace", "@module")
link("@lsp.type.parameter", "@variable.parameter")
link("@lsp.type.property", "@property")
link("@lsp.type.string", "@string")
link("@lsp.type.type", "@type")
link("@lsp.type.variable", "@variable")

-- Common plugins
hl("LazyNormal", { fg = c.fg2, bg = c.bg4 })
hl("LazyButton", { fg = c.fg2, bg = c.bg5 })
hl("LazyButtonActive", { fg = c.bg1, bg = c.accent, bold = true })
hl("MasonNormal", { fg = c.fg2, bg = c.bg4 })
hl("WhichKey", { fg = c.accent })
hl("WhichKeyDesc", { fg = c.fg2 })
hl("WhichKeyGroup", { fg = c.fg3 })
hl("WhichKeySeparator", { fg = c.gutter })
hl("SnacksPicker", { fg = c.fg2, bg = c.bg4 })
hl("SnacksPickerBorder", { fg = c.bg5, bg = c.bg4 })
hl("SnacksPickerTitle", { fg = c.accent, bg = c.bg4, bold = true })
hl("SnacksPickerMatch", { fg = c.accent, bold = true })
hl("MiniIconsAzure", { fg = c.blue })
hl("MiniIconsBlue", { fg = c.blue })
hl("MiniIconsCyan", { fg = c.mint })
hl("MiniIconsGreen", { fg = c.mint })
hl("MiniIconsGrey", { fg = c.fg4 })
hl("MiniIconsOrange", { fg = c.accent })
hl("MiniIconsPurple", { fg = c.purple })
hl("MiniIconsRed", { fg = c.red2 })
hl("MiniIconsYellow", { fg = c.accent })

-- Terminal palette
vim.g.terminal_color_0 = "#101010"
vim.g.terminal_color_1 = c.red
vim.g.terminal_color_2 = "#90b99f"
vim.g.terminal_color_3 = c.yellow
vim.g.terminal_color_4 = c.blue
vim.g.terminal_color_5 = c.magenta
vim.g.terminal_color_6 = c.cyan
vim.g.terminal_color_7 = c.fg3
vim.g.terminal_color_8 = c.fg5
vim.g.terminal_color_9 = c.red2
vim.g.terminal_color_10 = c.mint
vim.g.terminal_color_11 = c.accent
vim.g.terminal_color_12 = c.purple
vim.g.terminal_color_13 = "#ecaad6"
vim.g.terminal_color_14 = "#f591b2"
vim.g.terminal_color_15 = c.fg0
