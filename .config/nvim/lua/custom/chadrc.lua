local M = {}

local plugins = require "custom.plugins"
local plugin_conf = require "custom.plugins.configs"

M.options = {
   relativenumber = true,
   user = function()
      vim.opt.relativenumber = true
   end,
}

M.plugins = {

   options = {
      lspconfig = {
         setup_lspconf = "custom.plugins.lspconfig",
      },
   },

   status = {
      dashboard = true,
      alpha = true,
   },

   default_plugin_config_replace = {
      nvim_treesitter = plugin_conf.treesitter,
      nvimtree = plugin_conf.nvimtree,
   },

   user = plugins,
}

M.ui = {
   theme = "tokyodark",
}

M.mappings = require "custom.mappings"

return M
