import { z } from 'zod'
import { zoneLayoutSchema } from './config'

export const adminLayoutZoneSchema = z.object({
  zone: z.string(),
  source: z.enum(['code', 'database', 'none']),
  locked: z.boolean(),
  warnings: z.array(z.string()),
  /** The layout declared in medusa-config. */
  code: zoneLayoutSchema.nullable(),
  /** The layout saved with "Save for everyone", in medusa-config format. */
  database: zoneLayoutSchema.nullable(),
  /** The page's sections as they currently show for everyone, with their entries in order. */
  sections: z.array(
    z.object({
      name: z.string(),
      entries: z.array(z.object({ id: z.string(), hidden: z.boolean() })),
    }),
  ),
})

export const adminLayoutsResponseSchema = z.object({
  medusa_version: z.string(),
  catalog_version: z.string(),
  zones: z.array(adminLayoutZoneSchema),
})

export type AdminLayoutZone = z.infer<typeof adminLayoutZoneSchema>
export type AdminLayoutsResponse = z.infer<typeof adminLayoutsResponseSchema>
