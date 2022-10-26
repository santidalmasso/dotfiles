return {
   ["nathom/filetype.nvim"] = {},

   ["kdheepak/monochrome.nvim"] = {
      before = "nvim-web-devicons",
      config = function()
         require("monochrome").setup()
      end,
   },

   ["pwntester/octo.nvim"] = {
      requires = {
         "nvim-lua/plenary.nvim",
         "nvim-telescope/telescope.nvim",
         "kyazdani42/nvim-web-devicons",
      },
      config = function()
         require("octo").setup()
      end,
   },

   ["jose-elias-alvarez/null-ls.nvim"] = {
      after = "nvim-lspconfig",
      config = function()
         require("custom.plugins.null-ls").setup()
      end,
   },

   ["windwp/nvim-ts-autotag"] = {
      ft = { "html", "javascriptreact" },
      after = "nvim-treesitter",
      config = function()
         require("nvim-ts-autotag").setup()
      end,
   },

   ["ThePrimeagen/refactoring.nvim"] = {
      after = { "nvim-treesitter", "telescope.nvim" },
      requires = {
         { "nvim-lua/plenary.nvim" },
         { "nvim-treesitter/nvim-treesitter" },
      },
      config = function()
         require("refactoring").setup()
      end,
   },

   ["nvim-telescope/telescope-media-files.nvim"] = {
      after = "telescope.nvim",
      config = function()
         require("telescope").setup {
            extensions = {
               media_files = {
                  filetypes = { "png", "webp", "jpg", "jpeg" },
                  find_cmd = "rg",
               },
            },
         }
         require("telescope").setup()
      end,
   },

   ["Pocco81/TrueZen.nvim"] = {
      cmd = {
         "TZAtaraxis",
         "TZMinimalist",
         "TZFocus",
      },
      config = function()
         require "custom.plugins.truezen"
      end,
   },
}
