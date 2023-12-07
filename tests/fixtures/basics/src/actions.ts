export function echoReverse(message: string) {
    return message.split('').reverse().join('')
}

export function prefixedEchoReverse(message: string) {
    return `${process.env.REVERSE_PREFIX}-${message.split('').reverse().join('')}`
}
