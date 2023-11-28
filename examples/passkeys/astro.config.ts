import { defineConfig } from "astro/config"
import node from "@astrojs/node"
import react from "@astrojs/react"
import actions from "astro-actions"

// https://astro.build/config
export default defineConfig({
    output: "server",
    integrations: [react(), actions()],
    adapter: node({
        mode: "standalone"
    })
})
