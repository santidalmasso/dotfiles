-- Debug configs for the aleph monorepo: run vitest under the js-debug (pwa-node)
-- adapter that lazyvim.plugins.extras.lang.typescript already registers.
local function package_root()
  return vim.fs.root(0, "package.json") or vim.uv.cwd()
end

local function vitest_args(extra)
  -- --no-file-parallelism keeps vitest in the main process; otherwise breakpoints
  -- inside worker threads never bind. Timeouts must be off (vitest disables them
  -- when <= 0) or sitting on a breakpoint fails the test with STACK_TRACE_ERROR.
  local args = {
    "vitest",
    "run",
    "--no-file-parallelism",
    "--testTimeout=0",
    "--hookTimeout=0",
    vim.fn.expand("%:p"),
  }
  return vim.list_extend(args, extra or {})
end

return {
  {
    "mfussenegger/nvim-dap",
    opts = function()
      local dap = require("dap")

      local configs = {
        {
          type = "pwa-node",
          request = "launch",
          name = "Vitest: debug current file",
          cwd = package_root,
          runtimeExecutable = "pnpm",
          runtimeArgs = vitest_args,
          skipFiles = { "<node_internals>/**" },
        },
        {
          type = "pwa-node",
          request = "launch",
          name = "Vitest: debug tests matching name",
          cwd = package_root,
          runtimeExecutable = "pnpm",
          runtimeArgs = function()
            local name = coroutine.yield(function(resume)
              vim.ui.input({ prompt = "Test name filter (-t): " }, resume)
            end)
            if not name or name == "" then
              return vitest_args()
            end
            return vitest_args({ "-t", name })
          end,
          skipFiles = { "<node_internals>/**" },
        },
      }

      for _, lang in ipairs({ "javascript", "typescript" }) do
        dap.configurations[lang] = vim.list_extend(dap.configurations[lang] or {}, configs)
      end
    end,
  },
}
