return {
  {
    "nvim-neotest/neotest",
    dependencies = { "marilari88/neotest-vitest" },
    opts = {
      adapters = {
        ["neotest-vitest"] = {
          -- neotest-vitest splits this on whitespace: argv[1] becomes the dap
          -- runtimeExecutable. --no-file-parallelism keeps vitest in a single
          -- process so breakpoints bind reliably under js-debug.
          vitestCommand = "pnpm exec vitest --no-file-parallelism",
        },
      },
    },
    keys = {
      {
        "<leader>td",
        function()
          -- Timeouts must be off while stepping: sitting on a breakpoint past
          -- testTimeout makes vitest fail the test with its internal
          -- STACK_TRACE_ERROR. vitest disables a timeout when it is <= 0.
          require("neotest").run.run({
            strategy = "dap",
            extra_args = { "--testTimeout=0", "--hookTimeout=0" },
          })
        end,
        desc = "Debug Nearest",
      },
    },
  },
}
