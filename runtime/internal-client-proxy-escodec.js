import { encode, decode } from "es-codec"

const headers = {
    "Accept": "application/es-codec",
    "Content-Type": "application/es-codec"
}

export function proxyAction(id) {
    return Object.assign(async (...args) => {
        const response = await fetch(new URL("/_action", location), {
            method: "POST",
            body: encode([ id, args ]),
            headers
        })
        if (response.ok === false) throw new Error(await response.text())
        return decode(await response.arrayBuffer())
    }, {
        async fetch(request) {
            const response = await fetch(new URL("/_action", location), {
                method: "POST",
                body: encode([ id, request ]),
                headers
            })
            if (response.ok === false) throw new Error(await response.text())
            return decode(await response.arrayBuffer())    
        }
    })
}
