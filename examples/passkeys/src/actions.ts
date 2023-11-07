import * as User from "db/users.ts"
import * as Token from "db/tokens.ts"
import { Astro } from "astro:actions"

export async function generateChallenge(username: string, hostname: string): Promise<GenerateChallengeReturn> {
    const userDetails = User.read({ username })
    
    if (userDetails === User.InvalidUsername) {
        return { error: "invalid username" } as const
    }
    else if (userDetails === User.NotFound) /* register */ {
        const challenge = crypto.getRandomValues(new Uint8Array(32))
        const userDetails = User.create({ username, pendingChallenge: challenge }) as User.Details
        
        return {
            type: "create",
            rp: {
                name: "Readable Relying Party Name",
                id: hostname
            },
            /**
             * An ArrayBuffer, TypedArray, or DataView provided by the relying
             * party's server and used as a cryptographic challenge. This value
             * will be signed by the authenticator and the signature will be sent
             * back as part of AuthenticatorAttestationResponse.attestationObject.
             */
            challenge,
            user: {
                id: userDetails.id,
                name: userDetails.username,
                displayName: userDetails.displayName
            },
            /**
             * An Array of objects which specify the key types and signature
             * algorithms the Relying Party supports, ordered from most
             * preferred to least preferred. The client and authenticator
             * will make a best-effort to create a credential of the most
             * preferred type possible.
             * 
             * alg: A number that is equal to a [COSE Algorithm Identifier]
             * (https://www.iana.org/assignments/cose/cose.xhtml#algorithms)
             * representing the cryptographic algorithm to use for this
             * credential type. It is recommended that relying parties that
             * wish to support a wide range of authenticators should include
             * at least the following values in the provided choices:
             */
            pubKeyCredParams: [
                /**
                 * Known in COSE as ES256
                 * Known in Subtle Crypto as "ECDSA"
                 */
                // { alg: -7, type: 'public-key' },
                /**
                 * Known in COSE as EdDSA
                 * Known in (server-only) Subtle Crypto as "Ed25519"
                 */
                // { alg: -8, type: 'public-key' },
                /**
                 * Known in COSE as RS256
                 * Known in Subtle Crypto as "RSASSA-PKCS1-v1_5"
                 */
                { alg: -257, type: 'public-key' }
            ],
            timeout: 60000,
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                requireResidentKey: true
            },
            attestation: "none"
        } satisfies PublicKeyCredentialCreationOptions & { type: "create" }
    }
    else if (userDetails.credentials.length === 0) /* partially registered */ {
        /* starting over */
        User.delete({ username })
        return await generateChallenge(username, hostname)
    }
    else /* login */ {
        const challenge = crypto.getRandomValues(new Uint8Array(32))
        const { credentials } = User.update({ username, pendingChallenge: challenge }) as User.Details
        const registeredCredentials = credentials.map(cred => cred.descriptor)

        return {
            type: "get",
            allowCredentials: registeredCredentials,
            challenge
        } satisfies PublicKeyCredentialRequestOptions & { type: "get" }
    }
}

export async function registerUser(user: {
    username: string
    credential: {
        rawId: BufferSource
        key: ArrayBuffer
        transports?: AuthenticatorTransport[]
        algorithm: number
        type: "public-key"
    }
}) {
    const readResult = User.read(user)
    
    if (readResult === User.InvalidUsername) return { error: "invalid username" } as const
    else if (readResult === User.NotFound || readResult.credentials.length === 0) { /* fallthrough */ }
    else return { error: "user already exists" } as const
    
    const key = await crypto.subtle.importKey(
        "spki",
        user.credential.key,
        user.credential.algorithm === -257 ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : "unsupported",
        true,
        ["verify"]
    )

    const descriptor : PublicKeyCredentialDescriptor = {
        id: user.credential.rawId,
        transports: user.credential.transports,
        type: user.credential.type
    }

    const userDetails = {
        username: user.username,
        credentials: [{ key, descriptor }],
    }

    if (readResult === User.NotFound) User.create(userDetails)
    else User.update(userDetails)

    const expires = new Date(Date.now() + 1000 * 60 * 60)
    const token = await Token.create(user.username, expires)
    Astro.cookies.set("Token", token, { expires })
    
    return { success: user.username } as const
}

export async function loginUser(
    username: string,
    response: {
        clientDataJSON: AuthenticatorAssertionResponse['clientDataJSON']
        authenticatorData: AuthenticatorAssertionResponse['authenticatorData']
        signature: AuthenticatorAssertionResponse['signature']
    }
) {
    const userDetails = User.read({ username })
    
    if (userDetails === User.InvalidUsername) return { error: "invalid username" } as const
    else if (userDetails === User.NotFound) return { error: "user not found" } as const

    const { pendingChallenge, credentials } = userDetails
    if (pendingChallenge === undefined) return { error: "no challenge pending" } as const

    const clientDataHash = await crypto.subtle.digest("SHA-256", response.clientDataJSON)
    const { key } = credentials[0]
    const verified = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        key,
        response.signature,
        Uint8Array.of(...new Uint8Array(response.authenticatorData), ...new Uint8Array(clientDataHash))
    )

    if (!verified) return { error: "invalid signature" } as const

    const expires = new Date(Date.now() + 1000 * 60 * 60)
    const token = await Token.create(username, expires)
    Astro.cookies.set("Token", token, { expires })

    return { success: username } as const
}

type GenerateChallengeReturn =
    | { error: "invalid username" }
    | PublicKeyCredentialCreationOptions & { type: "create" }
    | PublicKeyCredentialRequestOptions & { type: "get" }
