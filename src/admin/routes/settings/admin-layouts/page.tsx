import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Alert, Badge, Button, Container, Heading, Table, Text, toast } from '@medusajs/ui'
import { useQuery } from '@tanstack/react-query'
import { adminLayoutsResponseSchema, type AdminLayoutZone } from '../../../../lib/response'
import { sdk } from '../../../lib/sdk'

const SOURCE_COLORS = { code: 'green', database: 'blue', none: 'grey' } as const

const SOURCE_LABELS = { code: 'Code', database: 'Saved in admin', none: 'Medusa default' } as const

const sourceRank = (zone: AdminLayoutZone) => {
  return ['code', 'database', 'none'].indexOf(zone.source)
}

const toSnippet = (zones: AdminLayoutZone[]) => {
  const layouts = Object.fromEntries(
    zones.flatMap((zone) => {
      return zone.database ? [[zone.zone, zone.database]] : []
    }),
  )

  return `zones: ${JSON.stringify(layouts, null, 2)},`
}

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied, paste it into the plugin options in medusa-config')
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

const AdminLayoutsPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-layouts'],
    queryFn: async () => {
      return adminLayoutsResponseSchema.parse(await sdk.client.fetch('/admin/admin-layouts'))
    },
  })

  const zones = [...(data?.zones ?? [])].sort((a, b) => {
    return sourceRank(a) - sourceRank(b) || a.zone.localeCompare(b.zone)
  })
  const saved = zones.filter((zone) => {
    return zone.database !== null
  })
  const versionMismatch =
    data !== undefined &&
    data.medusa_version.split('.').slice(0, 2).join('.') !== data.catalog_version.split('.').slice(0, 2).join('.')

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="min-w-0">
          <Heading>Admin layouts</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Arrange a page in the admin, save it for everyone, then copy it here into medusa-config.
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          className="shrink-0"
          disabled={saved.length === 0}
          onClick={async () => {
            await copy(toSnippet(saved))
          }}
        >
          Copy all as code
        </Button>
      </div>
      {versionMismatch && (
        <div className="px-6 py-4">
          <Alert variant="warning">
            The section catalog is from Medusa {data.catalog_version}, but {data.medusa_version} is installed. Replaced
            and reordered sections may land in the wrong place.
          </Alert>
        </div>
      )}
      {error && (
        <div className="px-6 py-4">
          <Alert variant="error">{error.message}</Alert>
        </div>
      )}
      {isLoading ? (
        <div className="px-6 py-4">
          <Text size="small">Loading…</Text>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Zone</Table.HeaderCell>
                <Table.HeaderCell>Layout</Table.HeaderCell>
                <Table.HeaderCell>Notes</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {zones.map((zone) => {
                return (
                  <Table.Row key={zone.zone}>
                    <Table.Cell className="font-mono text-xs">{zone.zone}</Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-1">
                        <Badge size="2xsmall" color={SOURCE_COLORS[zone.source]}>
                          {SOURCE_LABELS[zone.source]}
                        </Badge>
                        {zone.locked && (
                          <Badge size="2xsmall" color="orange">
                            Locked
                          </Badge>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {zone.source === 'code' && zone.database && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          A layout saved in the admin exists but code takes precedence.
                        </Text>
                      )}
                      {zone.warnings.map((warning) => {
                        return (
                          <Text key={warning} size="xsmall" className="text-ui-fg-error">
                            {warning}
                          </Text>
                        )
                      })}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {zone.database && (
                        <Button
                          size="small"
                          variant="transparent"
                          onClick={async () => {
                            await copy(toSnippet([zone]))
                          }}
                        >
                          Copy as code
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'Admin layouts',
})

export default AdminLayoutsPage
