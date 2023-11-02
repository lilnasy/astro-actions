import { AsyncLocalStorage } from "node:async_hooks"
import type { APIContext } from "astro"

export const astroGlobalStorage = new AsyncLocalStorage<APIContext>()
