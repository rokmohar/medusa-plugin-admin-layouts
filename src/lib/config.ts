import { z } from 'zod'
import { CATALOG, type CORE_ENTRIES } from '../catalog/core-entries'

export const PLUGIN_NAME = '@rokmohar/medusa-plugin-admin-layouts'

const coreId = z.string().regex(/^core:.+/, 'Core entry ids start with "core:", e.g. "core:OrderSummarySection"')
const widgetId = z
  .string()
  .regex(/^widget:.+/, 'Widget ids start with "widget:" followed by the id from defineWidgetConfig')
const entryId = z
  .string()
  .regex(
    /^(core|widget):.+/,
    'Entry ids start with "core:" for Medusa sections or "widget:" followed by the id from defineWidgetConfig',
  )

export const zoneLayoutSchema = z.object({
  hide: z.array(entryId).optional(),
  replace: z.record(coreId, widgetId).optional(),
  sections: z.record(z.string(), z.array(entryId)).optional(),
  lock: z.boolean().optional(),
})

export const adminLayoutsSchema = z
  .object({
    lock: z.boolean().default(false),
    zones: z.record(z.string(), zoneLayoutSchema).default({}),
  })
  .superRefine((config, ctx) => {
    for (const [zone, layout] of Object.entries(config.zones)) {
      const placed = new Map<string, string>()

      for (const [section, ids] of Object.entries(layout.sections ?? {})) {
        for (const id of ids) {
          const other = placed.get(id)

          if (other !== undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['zones', zone, 'sections', section],
              message: `"${id}" is already listed in section "${other}"`,
            })
          }

          placed.set(id, section)
        }
      }

      const replacements = Object.values(layout.replace ?? {})

      if (new Set(replacements).size !== replacements.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['zones', zone, 'replace'],
          message: 'Each widget can replace only one core entry',
        })
      }

      if (replacements.length > 0 && !CATALOG[zone]) {
        ctx.addIssue({
          code: 'custom',
          path: ['zones', zone, 'replace'],
          message: `Zone "${zone}" is not in the core entry catalog, so replace can't find the entry's position. Use hide and sections instead.`,
        })
      }
    }
  })

export type ZoneLayout = z.infer<typeof zoneLayoutSchema>
export type AdminLayouts = z.output<typeof adminLayoutsSchema>

type CoreEntries = typeof CORE_ENTRIES

type EntryIdsOf<TSections> = TSections[keyof TSections] extends infer TList
  ? TList extends readonly (infer TId)[]
    ? TId
    : never
  : never

/** A page known to the core entry catalog, e.g. `"order.details"`. */
export type CatalogZone = keyof CoreEntries

/** A widget, by the id from its `defineWidgetConfig`. */
export type WidgetId = `widget:${string}`

/** The core entries of a page. Pages outside the catalog accept any `core:` id. */
export type CoreEntryId<TZone extends string = string> = TZone extends CatalogZone
  ? EntryIdsOf<CoreEntries[TZone]>
  : `core:${string}`

/** The layout sections of a page, e.g. `"main"` and `"side"`. */
export type SectionName<TZone extends string = string> = TZone extends CatalogZone
  ? keyof CoreEntries[TZone] & string
  : string

export type ZoneLayoutInput<TZone extends string = string> = {
  /** Sections and widgets to hide. */
  hide?: (CoreEntryId<TZone> | WidgetId)[]
  /** Core section → widget that takes its spot. The core section is hidden. */
  replace?: Partial<Record<CoreEntryId<TZone>, WidgetId>>
  /** Layout section → ids to show first, in this order. Listing an id under another section moves it there. */
  sections?: Partial<Record<SectionName<TZone>, (CoreEntryId<TZone> | WidgetId)[]>>
  /** Overrides the top-level `lock` for this page. */
  lock?: boolean
}

export type AdminLayoutsInput = {
  /** Keep hidden and replaced sections hidden in users' personal layouts. Defaults to `false`. */
  lock?: boolean
  /** The layout of each page, keyed by zone. Pages in the catalog get their section ids checked. */
  zones?: { [TZone in CatalogZone]?: ZoneLayoutInput<TZone> } & Record<string, ZoneLayoutInput>
}

/**
 * Returns warnings for core entry ids that don't exist in the catalog of the supported Medusa version.
 * They are not errors, because a zone can render entries the catalog doesn't know about.
 */
export const getCatalogWarnings = (zone: string, layout: ZoneLayout) => {
  const natural = CATALOG[zone]

  if (!natural) {
    return []
  }

  const known = new Set(Object.values(natural).flat())
  const ids = [
    ...(layout.hide ?? []),
    ...Object.keys(layout.replace ?? {}),
    ...Object.values(layout.sections ?? {}).flat(),
  ]
  const unknown = [...new Set(ids)].filter((id) => {
    return id.startsWith('core:') && !known.has(id)
  })
  const sections = Object.keys(layout.sections ?? {}).filter((section) => {
    return !(section in natural)
  })

  return [
    ...unknown.map((id) => {
      return `"${id}" is not a known core entry of "${zone}"`
    }),
    ...sections.map((section) => {
      return `"${section}" is not a section of "${zone}" (known: ${Object.keys(natural).join(', ')})`
    }),
  ]
}

/**
 * Validates admin layouts from an untyped source. Throws on invalid config, so the server fails at boot
 * instead of serving a broken layout.
 */
export const parseAdminLayouts = (input: unknown): AdminLayouts => {
  const result = adminLayoutsSchema.safeParse(input)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      return `  - ${issue.path.join(' > ')}: ${issue.message}`
    })

    throw new Error(`[${PLUGIN_NAME}] Invalid admin layouts:\n${issues.join('\n')}`)
  }

  for (const [zone, layout] of Object.entries(result.data.zones)) {
    for (const warning of getCatalogWarnings(zone, layout)) {
      console.warn(`[${PLUGIN_NAME}] ${warning}`)
    }
  }

  return result.data
}

/**
 * Declares the admin layouts in medusa-config, with the page names and section ids of the supported
 * Medusa version checked by TypeScript and the whole config validated at boot.
 */
export const defineAdminLayouts = (input: AdminLayoutsInput): AdminLayouts => {
  return parseAdminLayouts(input)
}

export const isLocked = (config: AdminLayouts, zone: string) => {
  return config.zones[zone]?.lock ?? config.lock
}
