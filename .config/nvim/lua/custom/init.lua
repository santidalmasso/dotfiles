-- MAPPINGS
local map = nvchad.map

-- telescope
map("v", "<leader>rr", "<Esc><cmd>lua require('telescope').extensions.refactoring.refactors()<CR>", { noremap = true })
map("n", "<leader>te", ":Telescope <CR>")

-- copilot
map("i", "<C-J>", 'copilot#Accept("<CR>")', { silent = true, expr = true })

-- truezen
map("n", "<leader>ta", ":TZAtaraxis <CR>")
map("n", "<leader>tm", ":TZMinimalist <CR>")
map("n", "<leader>tf", ":TZFocus <CR>")
