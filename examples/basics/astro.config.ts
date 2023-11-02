import { defineConfig } from "astro/config"
import actions from "astro-server-actions"
import node from "@astrojs/node"

export default defineConfig({
    integrations: [ actions() ],
    output: "server",
    adapter: node({ mode: 'standalone' }),
})
