import { CORE_ENTRIES } from '../catalog/core-entries'
import type { ZoneLayout } from './config'

export type WidgetPreference = {
  hidden?: boolean
  section?: string
  order?: number
}

export type LayoutPreference = {
  widgets: Record<string, WidgetPreference>
}

export type Catalog = Record<string, Record<string, string[]>>

/**
 * Ids that a locked zone keeps hidden, also in each user's personal layout.
 */
export const getLockedIds = (layout: ZoneLayout) => {
  return [...new Set([...(layout.hide ?? []), ...Object.keys(layout.replace ?? {})])]
}

/**
 * Turns a zone layout into the preference format the dashboard's LayoutComposer stores.
 *
 * Every section gets an explicit order: the listed entries first, then the remaining catalog entries in
 * their natural order. A replacing widget takes its core entry's spot, and the hidden core entry stays
 * right behind it, so it reappears in place if a user shows it again. Orders start at 1, so entries
 * without a saved order (order 0, e.g. a newly installed widget) appear at the top, as they do after a
 * layout is saved in the admin.
 */
export const compileZoneLayout = (zone: string, layout: ZoneLayout, catalog: Catalog = CORE_ENTRIES) => {
  const natural = catalog[zone] ?? {}
  const listed = layout.sections ?? {}
  const replace = layout.replace ?? {}
  const listedSection = new Map(
    Object.entries(listed).flatMap(([section, ids]) => {
      return ids.map((id): [string, string] => {
        return [id, section]
      })
    }),
  )
  const widgets: LayoutPreference['widgets'] = {}

  for (const section of new Set([...Object.keys(natural), ...Object.keys(listed)])) {
    const own = listed[section] ?? []
    const rest = (natural[section] ?? [])
      .flatMap((id) => {
        const replacement = replace[id]

        return replacement ? [replacement, id] : [id]
      })
      .filter((id) => {
        return !listedSection.has(id)
      })

    ;[...own, ...rest].forEach((id, index) => {
      widgets[id] = { section, order: index + 1 }
    })
  }

  for (const id of getLockedIds(layout)) {
    widgets[id] = { ...widgets[id], hidden: true }
  }

  return { widgets }
}

/**
 * Forces the given ids hidden in a stored layout.
 */
export const hideIds = (preference: LayoutPreference, ids: string[]): LayoutPreference => {
  const widgets = { ...preference.widgets }

  for (const id of ids) {
    widgets[id] = { ...widgets[id], hidden: true }
  }

  return { widgets }
}

/**
 * Whether two stored layouts place every entry the same way. Mirrors the dashboard's own comparison, where a
 * missing `hidden` equals `false`.
 */
export const samePreference = (a: LayoutPreference, b: LayoutPreference) => {
  const ids = new Set([...Object.keys(a.widgets), ...Object.keys(b.widgets)])

  return [...ids].every((id) => {
    const left = a.widgets[id]
    const right = b.widgets[id]

    return (
      (left?.hidden ?? false) === (right?.hidden ?? false) &&
      left?.order === right?.order &&
      left?.section === right?.section
    )
  })
}
