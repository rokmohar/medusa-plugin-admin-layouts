import { CORE_ENTRIES } from '../catalog/core-entries'
import type { Catalog, LayoutPreference } from './compile'
import type { ZoneLayout } from './config'

const naturalSectionOf = (natural: Record<string, string[]>, id: string) => {
  return Object.keys(natural).find((section) => {
    return natural[section]?.includes(id)
  })
}

const sameOrder = (a: string[], b: string[]) => {
  return (
    a.length === b.length &&
    a.every((id, index) => {
      return id === b[index]
    })
  )
}

/**
 * Turns a layout saved in the admin into a zone layout for medusa-config. Sections whose order matches
 * the catalog are left out, so the output only holds what was actually changed.
 *
 * Sections are ordered the way the dashboard's LayoutComposer does it: core entries in source order,
 * then saved widgets, stably sorted by their saved order, where a missing order counts as 0.
 */
export const exportZoneLayout = (
  zone: string,
  preference: LayoutPreference,
  catalog: Catalog = CORE_ENTRIES,
): ZoneLayout => {
  const natural = catalog[zone] ?? {}
  const entries = Object.entries(preference.widgets)
  const coreIds = Object.values(natural).flat()
  const rawOrder = [
    ...coreIds,
    ...entries
      .map(([id]) => {
        return id
      })
      .filter((id) => {
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

  const sections: Record<string, string[]> = {}

  for (const [section, ids] of bySection) {
    const sorted = [...ids].sort((a, b) => {
      return (preference.widgets[a]?.order ?? 0) - (preference.widgets[b]?.order ?? 0)
    })

    if (!sameOrder(sorted, natural[section] ?? [])) {
      sections[section] = sorted
    }
  }

  const hide = entries
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
