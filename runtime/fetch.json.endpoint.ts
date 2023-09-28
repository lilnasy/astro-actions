// @ts-expect-error
import * as serverFunctions from "server:functions"
import type { APIRoute } from "astro"

export const POST : APIRoute = async ({ request }) => {
    const [ funName, args ] = await request.json()
    const result = await serverFunctions[funName](...args)
    return Response.json(result)
}
