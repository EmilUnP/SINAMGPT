import { spawn } from "node:child_process";

process.env.RUN_PROVIDER_INTEGRATION = "1";
process.env.RUN_LONG_JOB_TEST = "1";

const child = spawn(
  "npx",
  [
    "vitest",
    "run",
    "src/lib/providers.integration.test.ts",
    "src/lib/jobs/handlers/demo-sleep.test.ts",
  ],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
