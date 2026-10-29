import { readFileSync } from 'node:fs'
import type { ConfigModule } from '@medusajs/framework/types'
import { z } from 'zod'
import { CATALOG_MEDUSA_VERSION } from '../catalog/core-entries'
import { adminLayoutsSchema, PLUGIN_NAME, type AdminLayouts } from './config'

const pluginEntrySchema = z.object({ resolve: z.string(), options: z.unknown().optional() })
const packageJsonSchema = z.object({ version: z.string() })

let cached: AdminLayouts | undefined

/**
 * Reads this plugin's options from medusa-config. They were validated by `defineAdminLayouts` at boot,
 * parsing again only gives them a type.
 */
export const getAdminLayouts = (configModule: ConfigModule): AdminLayouts => {
  if (cached) {
    return cached
  }

  const entry = configModule.plugins
    .map((plugin) => {
      return pluginEntrySchema.safeParse(plugin)
    })
    .find((result) => {
      return result.success && result.data.resolve === PLUGIN_NAME
    })

  cached = adminLayoutsSchema.parse(entry?.data?.options ?? {})

  return cached
}

const minor = (version: string) => {
  return version.split('.').slice(0, 2).join('.')
}

export const getMedusaVersion = () => {
  const path = require.resolve('@medusajs/medusa/package.json')

  return packageJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).version
}

let versionWarned = false

/**
 * Logs once when the installed Medusa differs from the version the core entry catalog was made from.
 */
export const warnOnVersionMismatch = (log: (message: string) => void) => {
  if (versionWarned) {
    return
  }

  versionWarned = true

  const version = getMedusaVersion()

  if (minor(version) !== minor(CATALOG_MEDUSA_VERSION)) {
    log(
      `[${PLUGIN_NAME}] Core entry catalog is from Medusa ${CATALOG_MEDUSA_VERSION}, installed is ${version}. Positions of replaced or reordered entries may be off.`,
    )
  }
}
