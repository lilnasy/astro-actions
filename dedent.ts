/**
 * MIT License - Justin Ridgewell <justin@ridgewell.name>
 * https://github.com/jridgewell/string-dedent
 */

type Tag<A extends unknown[], R, T> = (
    this: T,
    strings: TemplateStringsArray,
    ...substitutions: A
) => R;

const cache = new WeakMap<TemplateStringsArray, TemplateStringsArray>();
const newline = /(\n|\r\n?|\u2028|\u2029)/g;
const leadingWhitespace = /^\s*/;
const nonWhitespace = /\S/;
const slice = Array.prototype.slice;

const zero = '0'.charCodeAt(0);
const nine = '9'.charCodeAt(0);
const lowerA = 'a'.charCodeAt(0);
const lowerF = 'f'.charCodeAt(0);
const upperA = 'A'.charCodeAt(0);
const upperF = 'F'.charCodeAt(0);

function dedent(str: string): string;
function dedent(str: TemplateStringsArray, ...substitutions: unknown[]): string;
function dedent<A extends unknown[], R, T>(tag: Tag<A, R, T>): Tag<A, R, T>;
function dedent<A extends unknown[], R, T>(
    arg: string | TemplateStringsArray | Tag<A, R, T>,
): string | Tag<A, R, T> {
    if (typeof arg === 'string') {
        return process([arg])[0];
    }

    if (typeof arg === 'function') {
        return function () {
            const args = slice.call(arguments);
            args[0] = processTemplateStringsArray(args[0]);
            return (arg as any).apply(this, args);
        } as Tag<A, R, T>;
    }

    const strings = processTemplateStringsArray(arg);
    // TODO: This is just `String.cooked`: https://tc39.es/proposal-string-cooked/
    let s = getCooked(strings, 0);
    for (let i = 1; i < strings.length; i++) {
        s += arguments[i] + getCooked(strings, i);
    }
    return s;
}

function getCooked(strings: readonly (string | undefined)[], index: number): string {
    const str = strings[index];
    if (str === undefined) throw new TypeError(`invalid cooked string at index ${index}`);
    return str;
}

function processTemplateStringsArray(strings: TemplateStringsArray): TemplateStringsArray {
    const cached = cache.get(strings);
    if (cached) return cached;

    const raw = process(strings.raw);
    const cooked = raw.map(cook) as unknown as TemplateStringsArray;

    Object.defineProperty(cooked, 'raw', {
        value: Object.freeze(raw),
    });
    Object.freeze(cooked);
    cache.set(strings, cooked);

    return cooked;
}

function process(strings: readonly string[]): readonly string[] {
    // splitQuasis is an array of arrays. The inner array is contains text content lines on the
    // even indices, and the newline char that ends the text content line on the odd indices.
    // In the first array, the inner array's 0 index is the opening line of the template literal.
    // In all other arrays, the inner array's 0 index is the continuation of the line directly after a
    // template expression.
    //
    // Eg, in the following case:
    //
    // ```
    // String.dedent`
    //   first
    //   ${expression} second
    //   third
    // `
    // ```
    //
    // We expect the following splitQuasis:
    //
    // ```
    // [
    //   ["", "\n", "  first", "\n", "  "],
    //   [" second", "\n", "  third", "\n", ""],
    // ]
    // ```
    const splitQuasis = strings.map((quasi) => quasi.split(newline));

    let common;
    for (let i = 0; i < splitQuasis.length; i++) {
        const lines = splitQuasis[i];

        // The first split is the static text starting at the opening line until the first template
        // expression (or the end of the template if there are no expressions).
        const firstSplit = i === 0;

        // The last split is all the static text after the final template expression until the closing
        // line. If there are no template expressions, then the first split is also the last split.
        const lastSplit = i + 1 === splitQuasis.length;

        // The opening line must be empty (it very likely is) and it must not contain a template
        // expression. The opening line's trailing newline char is removed.
        if (firstSplit) {
            // Length > 1 ensures there is a newline, and there is not a template expression.
            if (lines.length === 1 || lines[0].length > 0) {
                throw new Error('invalid content on opening line');
            }
            // Clear the captured newline char.
            lines[1] = '';
        }

        // The closing line may only contain whitespace and must not contain a template expression. The
        // closing line and its preceding newline are removed.
        if (lastSplit) {
            // Length > 1 ensures there is a newline, and there is not a template expression.
            if (lines.length === 1 || nonWhitespace.test(lines[lines.length - 1])) {
                throw new Error('invalid content on closing line');
            }
            // Clear the captured newline char, and the whitespace on the closing line.
            lines[lines.length - 2] = '';
            lines[lines.length - 1] = '';
        }

        // In the first spit, the index 0 is the opening line (which must be empty by now), and in all
        // other splits, its the content trailing the template expression (and so can't be part of
        // leading whitespace).
        // Every odd index is the captured newline char, so we'll skip and only process evens.
        for (let j = 2; j < lines.length; j += 2) {
            const text = lines[j];

            // If we are on the last line of this split, and we are not processing the last split (which
            // is after all template expressions), then this line contains a template expression.
            const lineContainsTemplateExpression = j + 1 === lines.length && !lastSplit;

            // leadingWhitespace is guaranteed to match something, but it could be 0 chars.
            const leading = leadingWhitespace.exec(text)![0];

            // Empty lines do not affect the common indentation, and whitespace only lines are emptied
            // (and also don't affect the comon indentation).
            if (!lineContainsTemplateExpression && leading.length === text.length) {
                lines[j] = '';
                continue;
            }

            common = commonStart(leading, common);
        }
    }

    const min = common ? common.length : 0;
    return splitQuasis.map((lines) => {
        let quasi = lines[0];
        for (let i = 1; i < lines.length; i += 2) {
            const newline = lines[i];
            const text = lines[i + 1];
            quasi += newline + text.slice(min);
        }
        return quasi;
    });
}

function commonStart(a: string, b: string | undefined): string {
    if (b === undefined || a === b) return a;
    let i = 0;
    for (const len = Math.min(a.length, b.length); i < len; i++) {
        if (a[i] !== b[i]) break;
    }
    return a.slice(0, i);
}

function cook(raw: string): string | undefined {
    let out = '';
    let start = 0;

    // We need to find every backslash escape sequence, and cook the escape into a real char.
    let i = 0;
    while ((i = raw.indexOf('\\', i)) > -1) {
        out += raw.slice(start, i);

        // If the backslash is the last char of the string, then it was an invalid sequence.
        // This can't actually happen in a tagged template literal, but could happen if you manually
        // invoked the tag with an array.
        if (++i === raw.length) return undefined;

        const next = raw[i++];
        switch (next) {
            // Escaped control codes need to be individually processed.
            case 'b':
                out += '\b';
                break;
            case 't':
                out += '\t';
                break;
            case 'n':
                out += '\n';
                break;
            case 'v':
                out += '\v';
                break;
            case 'f':
                out += '\f';
                break;
            case 'r':
                out += '\r';
                break;

            // Escaped line terminators just skip the char.
            case '\r':
                // Treat `\r\n` as a single terminator.
                if (i < raw.length && raw[i] === '\n') ++i;
            // fall through
            case '\n':
            case '\u2028':
            case '\u2029':
                break;

            // `\0` is a null control char, but `\0` followed by another digit is an illegal octal escape.
            case '0':
                if (isDigit(raw, i)) return undefined;
                out += '\0';
                break;

            // Hex escapes must contain 2 hex chars.
            case 'x': {
                const n = parseHex(raw, i, i + 2);
                if (n === -1) return undefined;
                i += 2;
                out += String.fromCharCode(n);
                break;
            }

            // Unicode escapes contain either 4 chars, or an unlimited number between `{` and `}`.
            // The hex value must not overflow 0x10ffff.
            case 'u': {
                let n;
                if (i < raw.length && raw[i] === '{') {
                    const end = raw.indexOf('}', ++i);
                    if (end === -1) return undefined;

                    n = parseHex(raw, i, end);
                    i = end + 1;
                } else {
                    n = parseHex(raw, i, i + 4);
                    i += 4;
                }
                if (n === -1 || n > 0x10ffff) return undefined;

                out += String.fromCodePoint(n);
                break;
            }

            default:
                if (isDigit(next, 0)) return undefined;
                out += next;
        }

        start = i;
    }

    return out + raw.slice(start);
}

function isDigit(str: string, index: number): boolean {
    const c = str.charCodeAt(index);
    return c >= zero && c <= nine;
}

function parseHex(str: string, index: number, end: number): number {
    if (end >= str.length) return -1;

    let n = 0;
    for (; index < end; index++) {
        const c = hexToInt(str.charCodeAt(index));
        if (c === -1) return -1;
        n = n * 16 + c;
    }
    return n;
}

function hexToInt(c: number): number {
    if (c >= zero && c <= nine) return c - zero;
    if (c >= lowerA && c <= lowerF) return c - lowerA + 10;
    if (c >= upperA && c <= upperF) return c - upperA + 10;
    return -1;
}

export default dedent;