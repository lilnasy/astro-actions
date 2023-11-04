import { astroGlobalStorage } from "./localstorage.ts"
import type { AstroGlobalPartial } from "../interface.ts" 

export const Astro: AstroGlobalPartial = {
    get cookies() {
        const ctx = astroGlobalStorage.getStore()
        if (ctx === undefined) throw new AccessedOutsideOfContext
        return ctx.cookies
    },
    get locals() {
        const ctx = astroGlobalStorage.getStore()
        if (ctx === undefined) throw new AccessedOutsideOfContext
        return ctx.locals
    }
}

class AccessedOutsideOfContext extends Error {
    name = "NoContext"
    constructor() {
        super('The Astro global was accessed outside the context of a request. Please make sure that it is only used inside the body of a server action.')
    }
}
