import type { APIContext, MiddlewareNext } from "astro"
import * as Token from "db/tokens.ts"
import * as User from "db/users.ts"

export async function onRequest(ctx: APIContext, next: MiddlewareNext<Response>) {
    const token = ctx.cookies.get("Token")
    if (token) {
        try {
            const { username, expires } = await Token.read(token.value)
            if (expires > new Date()) {
                const userDetails = User.read({ username })
                if (userDetails !== User.NotFound && userDetails !== User.InvalidUsername) {
                    ctx.locals.user = userDetails
                }
            }
        }
        catch (e) {
            console.error(new Error("Failed to read token even though it existed.", { cause: e }))
        }
    }
    return next()
}
