-- Overnight Italic
-- Ported from a VS Code theme to a Neovim colorscheme.

vim.opt.background = "dark"
vim.opt.termguicolors = true

if vim.g.colors_name then
  vim.cmd("highlight clear")
end
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end
vim.g.colors_name = "overnight-italic"

local c = {
  bg0 = "#070E1B",
  bg1 = "#0A1222",
  bg2 = "#0E1729",
  bg3 = "#121C30",
  bg4 = "#162137",
  bg5 = "#1B273E",
  bg6 = "#202C45",
  selection = "#26334C",
  fg0 = "#F2F2F2",
  fg1 = "#D6D9E0",
  fg2 = "#BBC1CD",
  fg3 = "#A2AABB",
  fg4 = "#8A94A8",
  fg5 = "#758096",
  comment = "#596378",
  gutter = "#4E5A71",
  red = "#f87086",
  red2 = "#F2B09A",
  orange = "#F78C6C",
  yellow = "#ecc48d",
  yellow2 = "#ffcb8b",
  green = "#BBD99E",
  cyan = "#92D8E6",
  teal = "#80CBC4",
  blue = "#8EACE3",
  blue2 = "#82b1ff",
  purple = "#c792ea",
  pink = "#ffa7c4",
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
hl("FloatTitle", { fg = c.yellow, bg = c.bg4, bold = true })
hl("ColorColumn", { bg = c.bg3 })
hl("Conceal", { fg = c.fg5 })
hl("Cursor", { fg = "#332D0F", bg = c.yellow })
hl("CursorIM", { fg = "#332D0F", bg = c.yellow })
hl("CursorLine", { bg = c.bg3 })
hl("CursorColumn", { bg = c.bg3 })
hl("Directory", { fg = c.blue })
hl("EndOfBuffer", { fg = c.bg2 })
hl("ErrorMsg", { fg = c.red })
hl("Folded", { fg = c.fg4, bg = c.bg3 })
hl("FoldColumn", { fg = c.gutter, bg = c.bg2 })
hl("SignColumn", { fg = c.gutter, bg = c.bg2 })
hl("IncSearch", { fg = c.fg0, bg = "#404D66" })
hl("Substitute", { fg = c.bg2, bg = c.yellow })
hl("LineNr", { fg = c.gutter, bg = c.bg2 })
hl("CursorLineNr", { fg = c.fg3, bg = c.bg3 })
hl("MatchParen", { fg = c.fg0, bg = c.selection, bold = true })
hl("ModeMsg", { fg = c.fg3 })
hl("MoreMsg", { fg = c.green })
hl("NonText", { fg = c.gutter })
hl("Pmenu", { fg = c.fg2, bg = c.bg4 })
hl("PmenuSel", { fg = c.fg1, bg = c.bg6 })
hl("PmenuSbar", { bg = c.bg5 })
hl("PmenuThumb", { bg = c.selection })
hl("Question", { fg = c.yellow })
hl("QuickFixLine", { fg = c.fg1, bg = c.bg5, bold = true })
hl("Search", { fg = c.fg0, bg = "#404D66" })
hl("SpecialKey", { fg = c.gutter })
hl("SpellBad", { sp = c.red, undercurl = true })
hl("SpellCap", { sp = c.blue, undercurl = true })
hl("SpellLocal", { sp = c.cyan, undercurl = true })
hl("SpellRare", { sp = c.purple, undercurl = true })
hl("StatusLine", { fg = c.fg5, bg = c.bg0 })
hl("StatusLineNC", { fg = c.fg5, bg = c.bg0 })
hl("TabLine", { fg = c.fg3, bg = c.bg1 })
hl("TabLineFill", { bg = c.bg1 })
hl("TabLineSel", { fg = c.fg1, bg = c.bg2 })
hl("Title", { fg = c.fg1, bold = true })
hl("Visual", { bg = c.selection })
hl("VisualNOS", { bg = c.selection })
hl("WarningMsg", { fg = c.yellow })
hl("Whitespace", { fg = c.gutter })
hl("WildMenu", { fg = c.fg1, bg = c.bg6 })
hl("WinBar", { fg = c.fg3, bg = c.bg2 })
hl("WinBarNC", { fg = c.fg5, bg = c.bg2 })
hl("WinSeparator", { fg = c.bg1 })

-- Diffs / diagnostics / git
hl("DiffAdd", { fg = c.green, bg = c.bg3 })
hl("DiffChange", { fg = c.blue, bg = c.bg3 })
hl("DiffDelete", { fg = c.red, bg = c.bg3 })
hl("DiffText", { fg = c.fg0, bg = c.selection })
hl("DiagnosticError", { fg = c.red })
hl("DiagnosticWarn", { fg = c.yellow })
hl("DiagnosticInfo", { fg = c.cyan })
hl("DiagnosticHint", { fg = c.purple })
hl("DiagnosticOk", { fg = c.green })
hl("DiagnosticUnderlineError", { sp = c.red, undercurl = true })
hl("DiagnosticUnderlineWarn", { sp = c.yellow, undercurl = true })
hl("DiagnosticUnderlineInfo", { sp = c.cyan, undercurl = true })
hl("DiagnosticUnderlineHint", { sp = c.purple, undercurl = true })
hl("GitSignsAdd", { fg = c.green, bg = c.bg2 })
hl("GitSignsChange", { fg = c.blue, bg = c.bg2 })
hl("GitSignsDelete", { fg = c.red2, bg = c.bg2 })

-- Syntax
hl("Comment", { fg = c.comment, italic = true })
hl("Constant", { fg = c.fg2 })
hl("String", { fg = c.purple })
hl("Character", { fg = c.pink })
hl("Number", { fg = c.orange })
hl("Boolean", { fg = c.red })
hl("Float", { fg = c.orange })
hl("Identifier", { fg = c.fg2 })
hl("Function", { fg = c.blue })
hl("Statement", { fg = c.purple, italic = true })
hl("Conditional", { fg = c.purple, italic = true })
hl("Repeat", { fg = c.pink, italic = true })
hl("Label", { fg = c.pink })
hl("Operator", { fg = c.purple })
hl("Keyword", { fg = c.purple, italic = true })
hl("Exception", { fg = c.pink, italic = true })
hl("PreProc", { fg = c.pink })
hl("Include", { fg = c.pink, italic = true })
hl("Define", { fg = c.pink })
hl("Macro", { fg = c.fg2 })
hl("PreCondit", { fg = c.pink })
hl("Type", { fg = c.yellow2 })
hl("StorageClass", { fg = c.pink, italic = true })
hl("Structure", { fg = c.blue })
hl("Typedef", { fg = c.pink, italic = true })
hl("Special", { fg = c.pink })
hl("SpecialChar", { fg = c.pink })
hl("Tag", { fg = c.pink })
hl("Delimiter", { fg = c.purple })
hl("SpecialComment", { fg = c.comment, italic = true })
hl("Debug", { fg = c.pink })
hl("Underlined", { fg = c.yellow, underline = true })
hl("Ignore", { fg = c.fg5 })
hl("Error", { fg = c.fg1, bg = c.red })
hl("Todo", { fg = c.yellow, bg = c.bg3, bold = true })

-- Treesitter
link("@comment", "Comment")
hl("@comment.documentation", { fg = c.comment, italic = true })
hl("@punctuation", { fg = c.purple })
hl("@punctuation.bracket", { fg = c.purple })
hl("@punctuation.delimiter", { fg = c.purple })
hl("@punctuation.special", { fg = c.pink })
hl("@string", { fg = c.purple })
hl("@string.documentation", { fg = c.comment })
hl("@string.escape", { fg = c.pink })
hl("@string.regexp", { fg = "#7986E7" })
hl("@string.special", { fg = c.teal })
hl("@character", { fg = c.pink })
hl("@number", { fg = c.orange })
hl("@boolean", { fg = c.red })
hl("@constant", { fg = c.fg2 })
hl("@constant.builtin", { fg = c.fg2 })
hl("@constant.macro", { fg = c.fg2 })
hl("@variable", { fg = c.fg2 })
hl("@variable.builtin", { fg = c.pink, italic = true })
hl("@variable.parameter", { fg = c.pink })
hl("@variable.member", { fg = c.fg2 })
hl("@module", { fg = c.fg2 })
hl("@label", { fg = c.pink })
hl("@type", { fg = c.yellow2 })
hl("@type.builtin", { fg = c.red })
hl("@type.definition", { fg = c.yellow2 })
hl("@attribute", { fg = c.purple, italic = true })
hl("@property", { fg = c.teal })
hl("@function", { fg = c.blue })
hl("@function.builtin", { fg = c.blue })
hl("@function.call", { fg = c.blue })
hl("@function.macro", { fg = c.pink })
hl("@constructor", { fg = c.yellow2 })
hl("@method", { fg = c.blue })
hl("@method.call", { fg = c.blue })
hl("@keyword", { fg = c.purple, italic = true })
hl("@keyword.conditional", { fg = c.purple, italic = true })
hl("@keyword.repeat", { fg = c.pink, italic = true })
hl("@keyword.return", { fg = c.pink, italic = true })
hl("@keyword.import", { fg = c.pink, italic = true })
hl("@keyword.function", { fg = c.pink, italic = true })
hl("@keyword.operator", { fg = c.purple })
hl("@operator", { fg = c.purple })
hl("@tag", { fg = c.pink })
hl("@tag.attribute", { fg = c.purple, italic = true })
hl("@tag.delimiter", { fg = c.purple })
hl("@markup.heading", { fg = c.blue2, bold = true })
hl("@markup.italic", { fg = c.purple, italic = true })
hl("@markup.strong", { fg = c.purple, bold = true })
hl("@markup.quote", { fg = "#697098" })
hl("@markup.raw", { fg = c.teal })
hl("@markup.link", { fg = "#ff869a", underline = true })
hl("@markup.list", { fg = c.blue2 })
hl("@diff.plus", { fg = c.green })
hl("@diff.minus", { fg = c.red })
hl("@diff.delta", { fg = "#a2bffc" })

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
hl("LazyButtonActive", { fg = "#332D0F", bg = c.yellow, bold = true })
hl("MasonNormal", { fg = c.fg2, bg = c.bg4 })
hl("WhichKey", { fg = c.purple })
hl("WhichKeyDesc", { fg = c.fg2 })
hl("WhichKeyGroup", { fg = c.blue })
hl("WhichKeySeparator", { fg = c.gutter })
hl("SnacksPicker", { fg = c.fg2, bg = c.bg4 })
hl("SnacksPickerBorder", { fg = c.bg5, bg = c.bg4 })
hl("SnacksPickerTitle", { fg = c.yellow, bg = c.bg4, bold = true })
hl("SnacksPickerMatch", { fg = c.yellow, bold = true })
hl("MiniIconsAzure", { fg = c.blue })
hl("MiniIconsBlue", { fg = c.blue })
hl("MiniIconsCyan", { fg = c.cyan })
hl("MiniIconsGreen", { fg = c.green })
hl("MiniIconsGrey", { fg = c.fg4 })
hl("MiniIconsOrange", { fg = c.orange })
hl("MiniIconsPurple", { fg = c.purple })
hl("MiniIconsRed", { fg = c.red })
hl("MiniIconsYellow", { fg = c.yellow })

-- Terminal palette
vim.g.terminal_color_0 = "#2E384D"
vim.g.terminal_color_1 = c.red
vim.g.terminal_color_2 = c.green
vim.g.terminal_color_3 = c.yellow
vim.g.terminal_color_4 = c.blue
vim.g.terminal_color_5 = c.purple
vim.g.terminal_color_6 = c.cyan
vim.g.terminal_color_7 = c.fg1
vim.g.terminal_color_8 = "#3D485F"
vim.g.terminal_color_9 = "#FFB3B3"
vim.g.terminal_color_10 = "#C9E2AF"
vim.g.terminal_color_11 = c.yellow
vim.g.terminal_color_12 = "#ACD1F5"
vim.g.terminal_color_13 = "#CCB3FF"
vim.g.terminal_color_14 = "#A5E0EC"
vim.g.terminal_color_15 = c.fg0
