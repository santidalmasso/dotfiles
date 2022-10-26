local M = {}

M.truezen = {
   n = {
      ["<leader>ta"] = { "<cmd> TZAtaraxis <CR>", "  truezen ataraxis" },
      ["<leader>tm"] = { "<cmd> TZMinimalist <CR>", "  truezen minimal" },
      ["<leader>tf"] = { "<cmd> TZFocus <CR>", "  truezen focus" },
   },
}

M.telescope = {
   n = {
      ["<leader>te"] = { ":Telescope <CR>" },
   },

   v = {
      ["<leader>rr"] = {
         "<Esc><cmd>lua require('telescope').extensions.refactoring.refactors()<CR>",
      },
   },
}

M.copilot = {
   i = {
      ["<C-j>"] = {
         'copilot#Accept("<CR>")',
      },
   },
}

return M
