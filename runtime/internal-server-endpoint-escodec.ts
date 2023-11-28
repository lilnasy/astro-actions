// "/client" gets resolved to direct function calls on the server
import * as actions from "astro:actions/client"
import { encode, decode } from "es-codec"
import type { APIRoute } from "astro"

export const POST: APIRoute = async context => {
    if (context.request.headers.get("Accept") !== "application/es-codec") throw new Error("Invalid Accept header. An action request must accept application/es-codec.")
    if (context.request.headers.get("Content-Type") !== "application/es-codec") throw new Error("Invalid Content-Type header. An action request must be application/es-codec.")
    const [ id, args ] = decode(await context.request.arrayBuffer()) as any

    // @ts-expect-error
    const action = actions[id]
    
    if (!action) throw new Error(`No action found for ${id}.`)
    
    if ("fetch" in action) {
        if (typeof action.fetch !== "function") {
            throw new Error(`The method "fetch" of the action "${id}" is not a function.`, { cause: action })
        }
        const result = await action.fetch(args, context)
        return new Response(encode(result))
    }
    
    if (typeof action !== "function") {
        throw new Error(`The action "${id}" is not a function.`, { cause: action })
    }
    
    const result = await action(...args)
    return new Response(encode(result))
}
