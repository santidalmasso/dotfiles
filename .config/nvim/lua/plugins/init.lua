vim.g.lazyvim_check_order = false

return {
  { "nvim-tree/nvim-web-devicons", opts = {} },
  { "ellisonleao/gruvbox.nvim" },
  {
    "oxfist/night-owl.nvim",
    lazy = false,
    priority = 1000,
  },
  {
    "nexxel/vesper.nvim",
    lazy = false,
    priority = 1000,
  },
  { "austinliuigi/smoke.nvim" },
  { "rebelot/kanagawa.nvim" },
  { "nyoom-engineering/oxocarbon.nvim" },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "catppuccin-mocha",
    },
  },
  { import = "lazyvim.plugins.extras.editor.plenary", enabled = false },
  { import = "lazyvim.plugins.extras.editor.refactoring", enabled = true },
  { import = "lazyvim.plugins.extras.editor.fzf" },
  { import = "lazyvim.plugins.extras.lang.typescript" },
  { import = "lazyvim.plugins.extras.lang.markdown" },
  { import = "lazyvim.plugins.extras.lang.json" },
  { import = "lazyvim.plugins.extras.lang.tailwind" },
  { import = "lazyvim.plugins.extras.linting.eslint" },
  { import = "lazyvim.plugins.extras.formatting.prettier" },
  { import = "lazyvim.plugins.extras.ai.copilot" },
  { import = "lazyvim.plugins.extras.util.gh" },
  {
    "zbirenbaum/copilot.lua",
    opts = function(_, opts)
      opts.copilot_node_command = "/Users/santidalmasso/.local/state/fnm_multishells/38917_1765891936288/bin/node"
      return opts
    end,
  },
  -- { import = "lazyvim.plugins.extras.util.dot" },
  { "sindrets/diffview.nvim" },
  {
    "nvim-telescope/telescope.nvim",
    enabled = false,
    -- keys = {
    --   { "<leader>/", false },
    --   { "<leader>ff", "<cmd>Telescope find_files<cr>", desc = "Find Files" },
    --   {
    --     ";f",
    --     function()
    --       local builtin = require("telescope.builtin")
    --       builtin.find_files({
    --         no_ignore = false,
    --         hidden = true,
    --       })
    --     end,
    --     desc = "Lists files",
    --   },
    -- },
  },
  {
    "akinsho/bufferline.nvim",
    enabled = false,
  },
  {
    "NeogitOrg/neogit",
    lazy = true,
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",

      -- Only one of these is needed.
      "nvim-telescope/telescope.nvim", -- optional
      "ibhagwan/fzf-lua", -- optional
      "nvim-mini/mini.pick", -- optional
      "folke/snacks.nvim", -- optional
    },
    cmd = "Neogit",
    keys = {
      { "<leader>gn", "<cmd>Neogit<cr>", desc = "Show Neogit UI" },
    },
  },
  {
    "folke/ts-comments.nvim",
    event = { "LazyFile", "VeryLazy" },
    keys = {
      {
        "<leader>/",
        function()
          vim.cmd.norm("gcc")
        end,
        desc = "Comment", -- toggle
        mode = "n",
      },
      {
        "<leader>/",
        function()
          vim.cmd.norm("gc")
        end,
        desc = "Comment", -- toggle
        mode = "v",
      },
    },
    opts = {},
  },
  {
    "Pocco81/true-zen.nvim",
    opts = {
      ui = {
        top = {
          showtabline = 0,
        },
        left = {
          number = true,
          relativenumber = true,
        },
      },
      modes = {
        ataraxis = {
          left_padding = 3,
          right_padding = 3,
          top_padding = 1,
          bottom_padding = 0,
          auto_padding = false,
        },
      },
    },
  },
}
