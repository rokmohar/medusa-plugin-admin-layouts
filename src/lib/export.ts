import { CATALOG, type Catalog } from '../catalog/core-entries'
import type { LayoutPreference } from './compile'
import type { ZoneLayout } from './config'

const naturalSectionOf = (natural: Catalog[string], id: string) => {
  return Object.keys(natural).find((section) => {
    return natural[section]?.includes(id)
  })
}

const sameOrder = (a: readonly string[], b: readonly string[]) => {
  return (
    a.length === b.length &&
    a.every((id, index) => {
      return id === b[index]
    })
  )
}

/**
 * Arranges a zone's entries the way the dashboard's LayoutComposer does: core entries in source order, then
 * saved widgets, stably sorted by their saved order, where a missing order counts as 0. Entries without a
 * known section are left out.
 */
export const arrangeZone = (zone: string, preference: LayoutPreference, catalog: Catalog = CATALOG) => {
  const natural = catalog[zone] ?? {}
  const coreIds = Object.values(natural).flat()
  const rawOrder = [
    ...coreIds,
    ...Object.keys(preference.widgets).filter((id) => {
      return !coreIds.includes(id)
    }),
  ]
  const bySection = new Map<string, string[]>()

  for (const id of rawOrder) {
    const section = preference.widgets[id]?.section ?? naturalSectionOf(natural, id)

    if (section !== undefined) {
      bySection.set(section, [...(bySection.get(section) ?? []), id])
    }
  }

  return new Map(
    [...bySection].map(([section, ids]) => {
      const sorted = [...ids].sort((a, b) => {
        return (preference.widgets[a]?.order ?? 0) - (preference.widgets[b]?.order ?? 0)
      })

      return [section, sorted]
    }),
  )
}

/**
 * Turns a layout saved in the admin into a zone layout for medusa-config. Sections whose order matches
 * the catalog are left out, so the output only holds what was actually changed.
 */
export const exportZoneLayout = (
  zone: string,
  preference: LayoutPreference,
  catalog: Catalog = CATALOG,
): ZoneLayout => {
  const natural = catalog[zone] ?? {}
  const sections: Record<string, string[]> = {}

  for (const [section, ids] of arrangeZone(zone, preference, catalog)) {
    if (!sameOrder(ids, natural[section] ?? [])) {
      sections[section] = ids
    }
  }

  const hide = Object.entries(preference.widgets)
    .filter(([, pref]) => {
      return pref.hidden === true
    })
    .map(([id]) => {
      return id
    })

  return {
    ...(hide.length > 0 ? { hide } : {}),
    ...(Object.keys(sections).length > 0 ? { sections } : {}),
  }
}
