import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Alert, Badge, Button, Container, Copy, Heading, Input, Label, Switch, Table, Text, toast } from '@medusajs/ui'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { adminLayoutsResponseSchema, type AdminLayoutZone } from '../../../../lib/response'
import { toZonesSnippet } from '../../../../lib/snippet'
import { sdk } from '../../../lib/sdk'

const SOURCE_COLORS = { code: 'green', database: 'blue', none: 'grey' } as const

const SOURCE_LABELS = { code: 'Code', database: 'Saved in admin', none: 'Medusa default' } as const

const sourceRank = (zone: AdminLayoutZone) => {
  return ['code', 'database', 'none'].indexOf(zone.source)
}

const minor = (version: string) => {
  return version.split('.').slice(0, 2).join('.')
}

const toSnippet = (zones: AdminLayoutZone[]) => {
  return toZonesSnippet(
    Object.fromEntries(
      zones.flatMap((zone) => {
        return zone.database ? [[zone.zone, zone.database]] : []
      }),
    ),
  )
}

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied, paste it into the plugin options in medusa-config')
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

const ZoneSections = ({ zone }: { zone: AdminLayoutZone }) => {
  if (zone.sections.length === 0) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        This page builds its sections at runtime, so they aren&apos;t listed. Use the ids shown in the layout
        customizer.
      </Text>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {zone.sections.map((section) => {
        return (
          <div key={section.name} className="flex min-w-0 flex-col gap-y-2">
            <Text size="small" weight="plus">
              {section.name}
            </Text>
            <ol className="flex flex-col gap-y-1">
              {section.entries.map((entry) => {
                return (
                  <li key={entry.id} className="flex min-w-0 items-center gap-x-2">
                    <code className="truncate font-mono text-xs text-ui-fg-base">{entry.id}</code>
                    <Copy content={entry.id} variant="mini" className="shrink-0" />
                    {entry.hidden && (
                      <Badge size="2xsmall" color="grey" className="shrink-0">
                        Hidden
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </div>
  )
}

const AdminLayoutsPage = () => {
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-layouts'],
    queryFn: async () => {
      return adminLayoutsResponseSchema.parse(await sdk.client.fetch('/admin/admin-layouts'))
    },
  })

  const allZones = [...(data?.zones ?? [])].sort((a, b) => {
    return sourceRank(a) - sourceRank(b) || a.zone.localeCompare(b.zone)
  })
  const query = search.trim().toLowerCase()
  const zones = allZones.filter((zone) => {
    return (showAll || query !== '' || zone.source !== 'none') && zone.zone.toLowerCase().includes(query)
  })
  const saved = allZones.filter((zone) => {
    return zone.database !== null
  })
  const versionMismatch = data !== undefined && minor(data.medusa_version) !== minor(data.catalog_version)

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <Input
          size="small"
          type="search"
          placeholder="Search pages"
          className="w-full sm:max-w-[240px]"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
        />
        <div className="flex items-center gap-x-2">
          <Switch id="admin-layouts-show-all" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="admin-layouts-show-all" size="small">
            Show pages with Medusa&apos;s default layout
          </Label>
        </div>
      </div>
      {isLoading ? (
        <div className="px-6 py-4">
          <Text size="small">Loading…</Text>
        </div>
      ) : zones.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {query
              ? 'No page matches your search.'
              : 'No page has a custom layout yet. Show all pages to browse their section ids.'}
          </Text>
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
                const isExpanded = expanded === zone.zone

                return (
                  <Fragment key={zone.zone}>
                    <Table.Row>
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
                      <Table.Cell>
                        <div className="flex justify-end gap-x-2">
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
                          <Button
                            size="small"
                            variant="transparent"
                            aria-expanded={isExpanded}
                            onClick={() => {
                              setExpanded(isExpanded ? null : zone.zone)
                            }}
                          >
                            {isExpanded ? 'Hide sections' : 'Sections'}
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                    {isExpanded && (
                      <Table.Row className="hover:bg-transparent">
                        <td colSpan={4} className="px-6 py-4">
                          <ZoneSections zone={zone} />
                        </td>
                      </Table.Row>
                    )}
                  </Fragment>
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

export const handle = {
  breadcrumb: () => {
    return 'Admin layouts'
  },
}

export default AdminLayoutsPage
