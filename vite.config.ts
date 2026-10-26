import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      experimental: { tasks: true },
      tasks: {
        "notifications:auto-dispatch": {
          handler: fileURLToPath(
            new URL(
              "./src/tasks/notifications-auto-dispatch.ts",
              import.meta.url
            )
          ),
          description:
            "Send queued notification emails when automatic delivery is enabled."
        }
      },
      ...(process.env.VERCEL
        ? {}
        : { scheduledTasks: { "* * * * *": ["notifications:auto-dispatch"] } })
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact()
  ]
})

export default config
