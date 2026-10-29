import {
  AuthenticatedMedusaRequest,
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from '@medusajs/framework'
import { ContainerRegistrationKeys, MedusaError, Modules } from '@medusajs/framework/utils'
import { z } from 'zod'
import { compileZoneLayout, getLockedIds, hideIds, samePreference, type LayoutPreference } from '../lib/compile'
import { isLocked, type ZoneLayout } from '../lib/config'
import { getAdminLayouts, warnOnVersionMismatch } from '../lib/options'

const LAYOUT_ROUTE = '/admin/layouts/:zone/configuration'

const preferenceSchema = z.object({
  widgets: z.record(
    z.string(),
    z.object({
      hidden: z.boolean().optional(),
      section: z.string().optional(),
      order: z.number().optional(),
    }),
  ),
})

const configurationSchema = z.looseObject({ configuration: preferenceSchema })

const layoutResponseSchema = z.looseObject({
  personal_configuration: configurationSchema.nullable(),
  default_configuration: configurationSchema.nullable(),
})

const layoutBodySchema = z.looseObject({
  is_default: z.boolean().optional(),
  configuration: preferenceSchema,
})

type ManagedZone = { zone: string; layout: ZoneLayout; locked: boolean }

type StoredConfiguration = { configuration: LayoutPreference }

const resolveZone = (req: MedusaRequest): ManagedZone | undefined => {
  const configModule = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const config = getAdminLayouts(configModule)
  const zone = req.params.zone
  const layout = zone ? config.zones[zone] : undefined

  warnOnVersionMismatch((message) => {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(message)
  })

  return zone && layout ? { zone, layout, locked: isLocked(config, zone) } : undefined
}

/**
 * The layout response for a code-managed zone: the code layout as the shared default and, for locked zones,
 * the code-hidden entries hidden in the user's personal layout too.
 */
const toCodeResponse = <TPersonal extends StoredConfiguration, TStored extends object>(
  managed: ManagedZone,
  personal: TPersonal | null,
  stored: TStored | null,
) => {
  const lockedIds = managed.locked ? getLockedIds(managed.layout) : []

  return {
    personal_configuration: personal && {
      ...personal,
      configuration: hideIds(personal.configuration, lockedIds),
    },
    default_configuration: {
      id: `code:${managed.zone}`,
      user_id: null,
      created_at: null,
      updated_at: null,
      ...stored,
      zone: managed.zone,
      is_system_default: true,
      configuration: compileZoneLayout(managed.zone, managed.layout),
    },
  }
}

const serveCodeLayout = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const managed = resolveZone(req)

  if (!managed) {
    return next()
  }

  const send = res.json.bind(res)

  res.json = (body: unknown) => {
    const parsed = layoutResponseSchema.safeParse(body)

    if (!parsed.success) {
      return send(body)
    }

    return send({
      ...parsed.data,
      ...toCodeResponse(managed, parsed.data.personal_configuration, parsed.data.default_configuration),
    })
  }

  next()
}

const isAuthenticated = (req: MedusaRequest): req is AuthenticatedMedusaRequest => {
  return 'auth_context' in req
}

/**
 * Switches the user to the default view without storing anything. The admin switches views by saving the
 * default layout unchanged, which would otherwise store a copy of the code layout in the database.
 */
const switchToDefaultView = async (req: AuthenticatedMedusaRequest, res: MedusaResponse, managed: ManagedZone) => {
  const settings = req.scope.resolve(Modules.SETTINGS)
  const userId = req.auth_context.actor_id

  await settings.setActiveLayoutScope(managed.zone, userId, 'default')

  const [personal] = await settings.listLayoutConfigurations({ zone: managed.zone, user_id: userId }, { take: 1 })

  res.json({ ...toCodeResponse(managed, personal ?? null, null), active_scope: 'default' })
}

/**
 * Rejects saving a shared default for a zone that is managed in code, and keeps code-hidden entries
 * hidden when a user saves a personal layout for a locked zone.
 */
const guardCodeLayout = async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const managed = resolveZone(req)

  if (!managed) {
    return next()
  }

  const body = layoutBodySchema.parse(req.body)

  if (body.is_default) {
    if (isAuthenticated(req) && samePreference(body.configuration, compileZoneLayout(managed.zone, managed.layout))) {
      try {
        return await switchToDefaultView(req, res, managed)
      } catch (error) {
        return next(error)
      }
    }

    return next(
      new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The default layout of "${managed.zone}" is managed in code (medusa-config), it can't be saved for everyone here.`,
      ),
    )
  }

  if (managed.locked) {
    req.body = { ...body, configuration: hideIds(body.configuration, getLockedIds(managed.layout)) }
  }

  next()
}

export default defineMiddlewares({
  routes: [
    { matcher: LAYOUT_ROUTE, method: ['GET'], middlewares: [serveCodeLayout] },
    { matcher: LAYOUT_ROUTE, method: ['POST'], middlewares: [guardCodeLayout] },
  ],
})
