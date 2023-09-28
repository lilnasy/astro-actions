const fetchEndpoint = new URL(location.href)
fetchEndpoint.pathname = "/_sf"

export function createProxy(funName : string) {
    return async (...args: any[]) => await proxyImpl(funName, args)
}

async function proxyImpl(funName : string, args: any[]) {
    const response = await fetch(fetchEndpoint, {
        method: "POST",
        body: JSON.stringify([ funName, args ])
    })
    return await response.json()
}
