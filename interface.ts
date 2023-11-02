import { APIContext } from "astro"

export interface ServerActionsIntegrationOptions {
    /**
     * The format used by server actions to send data over the network.
     * 
     * When `"es-codec"` is selected, you will be able to send more types of data - including `BigInt`, `Map`, `Set`, `TypedArray`, and `ArrayBuffer`.
     * However, you will be sending slightly more javascript to the browser.
     * 
     * When `"JSON"` is selected, you will be sending very little javascript to the browser but data types will be limited to `number`, `string`, `Array`, and plain objects.
     */
    serialization: 'es-codec' | 'JSON'
}

export interface AstroGlobalPartial extends Pick<APIContext, 'url' | 'request' | 'redirect' | 'cookies' | 'locals'> {}
