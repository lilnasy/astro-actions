export async function f() {
    return "Hello from server functions!"
}

export async function sendStreamToServer(readable : ReadableStream<string>) {
    
    // @ts-ignore this runs on the server and the servers implement asynIterable for readable streams
    for await (const value of readable) console.log(value)
    
    return "done reading"
}

export async function sendUrlToServer(x : URL) {
    console.log(x)
    return x
}

type File = {
    name: string,
    type: string,
    size: number,
    lastModified: number,
    stream: ReadableStream<Uint8Array>
}

export async function sendFileToServer(x : File) {
    console.log(x)
    const stream = x.stream.pipeThrough(new TextDecoderStream())
    for await (const value of stream as any) console.log(value)
    return "received"
}

export async function sendFunctionToServer(clientFunction : (input : number) => Promise<void>) {
    setInterval(() => clientFunction(Math.random()), 2000)
}