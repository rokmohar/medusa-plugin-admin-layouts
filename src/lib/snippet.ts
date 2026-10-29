import type { ZoneLayout } from './config'

const PRINT_WIDTH = 120
const INDENT = '  '

type Value = string | boolean | Value[] | { [key: string]: Value | undefined }

/**
 * Quotes like Prettier with `singleQuote`: single quotes, unless the string holds more single than double
 * quotes.
 */
const printString = (value: string) => {
  const singles = value.split("'").length - 1
  const doubles = value.split('"').length - 1
  const quote = singles > doubles ? '"' : "'"
  const escaped = value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`)

  return `${quote}${escaped}${quote}`
}

const printKey = (key: string) => {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : printString(key)
}

/**
 * Prints a value the way Prettier formats medusa-config with single quotes: objects always break onto
 * several lines, arrays stay on one line while they fit the print width.
 */
const print = (value: Value, depth: number, prefix: number): string => {
  if (typeof value === 'string') {
    return printString(value)
  }

  if (typeof value === 'boolean') {
    return String(value)
  }

  const inner = INDENT.repeat(depth + 1)
  const outer = INDENT.repeat(depth)

  if (Array.isArray(value)) {
    const inline = `[${value
      .map((item) => {
        return print(item, depth, 0)
      })
      .join(', ')}]`

    if (value.length === 0 || prefix + inline.length + 1 <= PRINT_WIDTH) {
      return inline
    }

    const items = value.map((item) => {
      return `${inner}${print(item, depth + 1, inner.length)},`
    })

    return `[\n${items.join('\n')}\n${outer}]`
  }

  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (item === undefined) {
      return []
    }

    const head = `${inner}${printKey(key)}: `

    return [`${head}${print(item, depth + 1, head.length)},`]
  })

  return entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n${outer}}`
}

/**
 * Prints zone layouts as the `zones` property of the plugin options, ready to paste into medusa-config.
 */
export const toZonesSnippet = (zones: Record<string, ZoneLayout>) => {
  return `zones: ${print(zones, 0, 'zones: '.length)},`
}
