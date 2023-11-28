// "/client" gets resolved to direct function calls on the server
import * as actions from "astro:actions/client"

import type { APIRoute } from "astro"

export const POST: APIRoute = async context => {
    if (context.request.headers.get("Accept") !== "application/json") throw new Error("Invalid Accept header. An action request must accept application/json.")
    if (context.request.headers.get("Content-Type") !== "application/json") throw new Error("Invalid Content-Type header. An action request must be application/json.")
    const [ id, args ] = await context.request.json()

    // @ts-expect-error
    const action = actions[id]
    
    if (!action) throw new Error(`No action found for ${id}.`)
    
    if ("fetch" in action) {
        if (typeof action.fetch !== "function") {
            throw new Error(`The method "fetch" of the action "${id}" is not a function.`, { cause: action })
        }
        const result = await action.fetch(args, context)
        return Response.json(result)
    }
    
    if (typeof action !== "function") {
        throw new Error(`The action "${id}" is not a function.`, { cause: action })
    }
    
    const result = await action(...args)
    return Response.json(result)
}
