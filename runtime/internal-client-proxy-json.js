

const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}

export function proxyAction(id) {
    return Object.assign(async function (...args) {
        const response = await fetch(new URL("/_action", location), {
            method: "POST",
            body: JSON.stringify([ id, args ]),
            headers
        })
        if (response.ok === false) throw new Error(await response.text())
        return await response.json()
    }, {
        async fetch(request) {
            const response = await fetch(new URL("/_action", location), {
                method: "POST",
                body: JSON.stringify([ id, request ]),
                headers
            })
            if (response.ok === false) throw new Error(await response.text())
            return await response.json()    
        }
    })
}
