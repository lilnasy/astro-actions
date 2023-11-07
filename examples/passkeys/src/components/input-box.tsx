import { useState } from "react"
import * as Actions from "../actions.ts"

export default function () {
    const [ username, setUsername ] = useState("")
    const [ output, setOutput ] = useState("")
    const [ submitting, setSubmitting ] = useState(false)
    return <form onSubmit={async event => {
        event.preventDefault()
        setSubmitting(true)
        await maybeLoginOrSignup(username, setOutput)
        setSubmitting(false)
    }}>
        <label htmlFor="username">Enter your username or create a new one</label>
        <input
            type="text"
            name="username"
            id="username"
            placeholder="username"
            minLength={3}
            maxLength={12}
            pattern="^[a-zA-Z0-9\.\-_]+$"
            required
            autoFocus
            onChange={event => setUsername(event.target.value)}
        />
        <button type="submit" title="Submit" disabled={submitting || username === ''}>{'>'}</button>
        <output>{output}</output>
    </form>
}

async function maybeLoginOrSignup(username: string, setOutput: React.Dispatch<React.SetStateAction<string>>) {
    if (Boolean(username) === false) return setOutput("Username cannot be empty")

    const options = await Actions.generateChallenge(username, location.hostname)
    
    if ("error" in options) return setOutput(options.error)

    if (options.type === "create") /* register */ {
        let cred: Credential | null = null
        
        try { cred = await navigator.credentials.create({ publicKey: options }) }
        catch (e: any) { return setOutput(e.message) }

        if (cred === null) return setOutput("This browser could not create a credential that macthes the given options")
        console.log(cred)
        const pkCred = cred as PublicKeyCredential
        const response = pkCred.response as AuthenticatorAttestationResponse
        const { error, success } = await Actions.registerUser({
            username,
            credential: {
                rawId: pkCred.rawId,
                type: pkCred.type as "public-key",
                key: response.getPublicKey()!,
                algorithm: response.getPublicKeyAlgorithm(),
                transports: response.getTransports() as AuthenticatorTransport[]
            }
        })
        if (error) return setOutput(error)
        // return location.pathname = "/"
    }
    
    else if (options.type === "get") /* login */ {
        const cred = await navigator.credentials.get({ publicKey: options })
        if (cred === null) return setOutput("Failed to get credential")
        const pkCred = cred as PublicKeyCredential
        const response = pkCred.response as AuthenticatorAssertionResponse
        const { error, success } = await Actions.loginUser(username, {
            authenticatorData: response.authenticatorData,
            clientDataJSON: response.clientDataJSON,
            signature: response.signature
        })
        if (error) return setOutput(error)
        return location.pathname = "/"
    }
}
