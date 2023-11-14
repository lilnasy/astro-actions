import { encode, decode } from "es-codec"

const fetchEndpoint = new URL(location.href)
fetchEndpoint.pathname = "/_action"

export function createProxy(funName : string) {
    return async (...args: any[]) => await rpc(funName, args)
}

async function rpc(funName : string, args: any[]) {
    const response = await fetch(fetchEndpoint, {
        method: "POST",
        body: encode([ funName, args ])
    })
    return decode(await response.arrayBuffer())
}
