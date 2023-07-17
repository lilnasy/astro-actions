export async function f() {
    return "Hello from server functions!"
}

export async function sendStreamToServer(readable : ReadableStream<string>) {
    
    // @ts-ignore this runs on the server and the servers implement asynIterable for readable streams
    for await (const value of readable)
        console.log(value)
    
    return "done reading"
}