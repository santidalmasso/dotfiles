-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local map = LazyVim.safe_keymap_set

map("n", "<leader>/", "gcc", { desc = "Toggle comment", remap = true })
map("v", "<leader>/", "gc", { desc = "Toggle comment", remap = true })

map("n", "<leader>ta", ":TZAtaraxis <CR>")
map("n", "<leader>tm", ":TZMinimalist <CR>")
map("n", "<leader>tf", ":TZFocus <CR>")

local function git_tui(cmd)
  Snacks.terminal(cmd, {
    cwd = LazyVim.root.git(),
    win = { position = "float", width = 0, height = 0, border = "none", keys = { hide = { "<c-g>", "hide", mode = "t" } } },
  })
end

map("n", "<leader>gH", function() git_tui("gh dash") end, { desc = "GitHub Dashboard (gh-dash)" })
map("n", "<leader>gr", function() git_tui("tuicr") end, { desc = "Review Changes (tuicr)" })
map("n", "<leader>gR", function()
  local pr = vim.system({ "gh", "pr", "view", "--json", "number", "-q", ".number" }, { cwd = LazyVim.root.git() }):wait()
  if pr.code ~= 0 then
    return Snacks.notify.warn(vim.trim(pr.stderr), { title = "tuicr" })
  end
  git_tui({ "tuicr", "pr", vim.trim(pr.stdout) })
end, { desc = "Review Current PR (tuicr)" })

map({ "n", "x" }, "<leader>yr", function()
  local path = vim.fs.relpath(LazyVim.root.git(), vim.api.nvim_buf_get_name(0)) or vim.fn.expand("%:.")
  local a, b = vim.fn.line("v"), vim.fn.line(".")
  local ref = path .. ":" .. (a == b and a or math.min(a, b) .. "-" .. math.max(a, b))
  vim.fn.setreg("+", ref)
  Snacks.notify.info("Copied " .. ref)
end, { desc = "Copy File:Line Reference" })

-- map("n", "<leader>fw", "<cmd>FzLua live_grep <CR>", { desc = "Find word" })
