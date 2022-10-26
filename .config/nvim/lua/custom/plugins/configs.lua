local M = {}

M.treesitter = {
   ensure_installed = {
      "lua",
      "vim",
      "html",
      "css",
      "javascript",
      "typescript",
      "json",
      "markdown",
      "bash",
   },
}

M.nvimtree = {
   git = {
      enable = true,
   },
}

return M
