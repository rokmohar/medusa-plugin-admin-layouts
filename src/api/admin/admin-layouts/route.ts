import { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { CATALOG_MEDUSA_VERSION, CORE_ENTRIES } from '../../../catalog/core-entries'
import { getCatalogWarnings, isLocked } from '../../../lib/config'
import { exportZoneLayout } from '../../../lib/export'
import { getAdminLayouts, getMedusaVersion } from '../../../lib/options'
import type { AdminLayoutsResponse, AdminLayoutZone } from '../../../lib/response'

export async function GET(req: MedusaRequest, res: MedusaResponse<AdminLayoutsResponse>) {
  const config = getAdminLayouts(req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE))
  const settings = req.scope.resolve(Modules.SETTINGS)
  const stored = await settings.listLayoutConfigurations({ is_system_default: true })
  const storedByZone = new Map(
    stored.map((layout) => {
      return [layout.zone, layout.configuration]
    }),
  )
  const zoneNames = new Set([...Object.keys(CORE_ENTRIES), ...Object.keys(config.zones), ...storedByZone.keys()])

  const zones = [...zoneNames].sort().map((zone): AdminLayoutZone => {
    const code = config.zones[zone] ?? null
    const preference = storedByZone.get(zone)
    const database = preference ? exportZoneLayout(zone, preference) : null

    return {
      zone,
      source: code ? 'code' : database ? 'database' : 'none',
      locked: code ? isLocked(config, zone) : false,
      warnings: code ? getCatalogWarnings(zone, code) : [],
      code,
      database,
    }
  })

  res.json({ medusa_version: getMedusaVersion(), catalog_version: CATALOG_MEDUSA_VERSION, zones })
}
