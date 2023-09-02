/*
The default function exported from this module is used to
generate identifiers for messages relevant to a Readable/
WritableStream, or function call.

For example, when a browser calls a server function, it
generates an ID and sends it along with the function name and
arguments. The server responds back the result with the same
ID, allowing the browser to connect the message to the
function call it was created for.

Server-initiated IDs start from -1, and decrement from there;
browser-initiated IDs start from 1, and increment from there.
This ensures one of them doesn't reuse IDs already used by
the otherwithout needing any co-ordination between the two
players.
*/

let x = 0

export default import.meta.env.SSR ? () => --x : () => ++x
