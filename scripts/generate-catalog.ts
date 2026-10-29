/**
 * Generates src/catalog/core-entries.ts from the Medusa dashboard source.
 *
 * Usage: yarn catalog <path-to-medusa-checkout> <git-tag>
 * Example: yarn catalog ../medusa v2.22.1
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

type Sections = Record<string, string[]>

const DASHBOARD_SRC = 'packages/admin/dashboard/src'
const SKIPPED_FILES = ['components/layout-composer/', 'exports/']
const DETAIL_PAGE_DEFAULTS: [option: string, id: string][] = [
  ['metadata', 'MetadataSection'],
  ['jsonView', 'JsonViewSection'],
  ['permissions', 'RequiredPermissionsSection'],
]

const [medusaDir, tag] = process.argv.slice(2)

if (!medusaDir || !tag) {
  throw new Error('Usage: yarn catalog <path-to-medusa-checkout> <git-tag>')
}

const git = (...args: string[]) => {
  return execFileSync('git', ['-C', medusaDir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const warnings: string[] = []

/**
 * Thrown when a page builds its entries at runtime. Such zones are left out of the catalog, because a
 * partial entry list would place configured entries wrongly.
 */
class DynamicEntriesError extends Error {}

const tagName = (node: ts.JsxOpeningLikeElement) => {
  return node.tagName.getText()
}

const attribute = (node: ts.JsxOpeningLikeElement, name: string) => {
  return node.attributes.properties.find((prop): prop is ts.JsxAttribute => {
    return ts.isJsxAttribute(prop) && prop.name.getText() === name
  })
}

const stringAttribute = (node: ts.JsxOpeningLikeElement, name: string) => {
  const initializer = attribute(node, name)?.initializer

  if (initializer && ts.isStringLiteral(initializer)) {
    return initializer.text
  }

  return undefined
}

const detailPageDefaultIds = (call: ts.CallExpression) => {
  const options = call.arguments[1]
  const disabled = new Set<string>()

  if (options && ts.isObjectLiteralExpression(options)) {
    for (const prop of options.properties) {
      if (ts.isPropertyAssignment(prop) && prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        disabled.add(prop.name.getText())
      }
    }
  }

  return DETAIL_PAGE_DEFAULTS.filter(([option]) => {
    return !disabled.has(option)
  }).map(([, id]) => {
    return id
  })
}

/**
 * Mirrors `collectElements` + `getCoreEntryKey` in the dashboard's layout composer: fragments and
 * expressions are flattened, every other element is one entry named by its `LayoutComposer.Entry` id
 * or, without a wrapper, by its tag name.
 */
const collectIds = (node: ts.Node, file: string, ids: string[]) => {
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    const name = tagName(opening)

    if (name !== 'LayoutComposer.Entry') {
      ids.push(name)

      return
    }

    const id = stringAttribute(opening, 'id')

    if (!id) {
      throw new DynamicEntriesError(`${file}: LayoutComposer.Entry has a dynamic id`)
    }

    ids.push(id)

    return
  }

  if (ts.isCallExpression(node) && node.expression.getText() === 'detailPageDefaultEntries') {
    ids.push(...detailPageDefaultIds(node))

    return
  }

  // Only the rendered side of `cond && <X />` and `cond ? <X /> : <Y />` can hold entries.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    collectIds(node.right, file, ids)

    return
  }

  if (ts.isConditionalExpression(node)) {
    collectIds(node.whenTrue, file, ids)
    collectIds(node.whenFalse, file, ids)

    return
  }

  if (ts.isCallExpression(node)) {
    throw new DynamicEntriesError(`${file}: entries come from \`${node.expression.getText()}(...)\``)
  }

  node.forEachChild((child) => {
    collectIds(child, file, ids)
  })
}

const withDuplicateSuffixes = (sections: Sections) => {
  const seen = new Map<string, number>()
  const result: Sections = {}

  for (const [section, ids] of Object.entries(sections)) {
    result[section] = ids.map((id) => {
      const count = seen.get(id) ?? 0

      seen.set(id, count + 1)

      return count === 0 ? `core:${id}` : `core:${id}#${count + 1}`
    })
  }

  return result
}

const parseFile = (file: string, source: string) => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pages: { zone: string; sections: Sections }[] = []

  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && tagName(node) === 'LayoutComposer') {
      const zone = stringAttribute(node, 'widgetsZonePrefix')
      const sectionsInitializer = attribute(node, 'sections')?.initializer

      if (!zone) {
        warnings.push(`${file}: LayoutComposer with a dynamic widgetsZonePrefix was skipped`)

        return
      }

      const sectionsObject =
        sectionsInitializer && ts.isJsxExpression(sectionsInitializer) ? sectionsInitializer.expression : undefined

      if (!sectionsObject || !ts.isObjectLiteralExpression(sectionsObject)) {
        warnings.push(`${file}: LayoutComposer "${zone}" without inline sections was skipped`)

        return
      }

      const sections: Sections = {}

      try {
        for (const prop of sectionsObject.properties) {
          if (!ts.isPropertyAssignment(prop)) {
            continue
          }

          const ids: string[] = []

          collectIds(prop.initializer, file, ids)
          sections[prop.name.getText()] = ids
        }
      } catch (error) {
        if (!(error instanceof DynamicEntriesError)) {
          throw error
        }

        warnings.push(`zone "${zone}" left out, ${error.message}`)

        return
      }

      pages.push({ zone, sections: withDuplicateSuffixes(sections) })
    }

    node.forEachChild(visit)
  }

  visit(sourceFile)

  return pages
}

const mergeSections = (target: Sections, source: Sections) => {
  for (const [section, ids] of Object.entries(source)) {
    const merged = target[section] ?? []

    for (const id of ids) {
      if (!merged.includes(id)) {
        merged.push(id)
      }
    }

    target[section] = merged
  }
}

const files = git('ls-tree', '-r', '--name-only', tag, '--', DASHBOARD_SRC)
  .split('\n')
  .filter((file) => {
    return file.endsWith('.tsx') && !SKIPPED_FILES.some((skipped) => file.includes(`${DASHBOARD_SRC}/${skipped}`))
  })

const zones: Record<string, Sections> = {}

for (const file of files) {
  const source = git('show', `${tag}:${file}`)

  if (!source.includes('<LayoutComposer')) {
    continue
  }

  for (const page of parseFile(file.replace(`${DASHBOARD_SRC}/`, ''), source)) {
    mergeSections((zones[page.zone] ??= {}), page.sections)
  }
}

const sortedZones = Object.fromEntries(
  Object.entries(zones).sort(([a], [b]) => {
    return a.localeCompare(b)
  }),
)
const version = tag.replace(/^v/, '')
const output = `// Generated by scripts/generate-catalog.ts from Medusa ${tag}. Do not edit by hand.
export const CATALOG_MEDUSA_VERSION = '${version}'

export const CORE_ENTRIES: Record<string, Record<string, string[]>> = ${JSON.stringify(sortedZones, null, 2)}
`

writeFileSync(join(__dirname, '..', 'src', 'catalog', 'core-entries.ts'), output)

const entryCount = Object.values(zones).reduce((sum, sections) => {
  return sum + Object.values(sections).flat().length
}, 0)

console.log(`Wrote ${Object.keys(zones).length} zones and ${entryCount} entries from ${tag}`)

for (const warning of warnings) {
  console.warn(`warning: ${warning}`)
}
