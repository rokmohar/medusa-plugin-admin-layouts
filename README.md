# Admin layouts plugin for Medusa

[![npm version](https://img.shields.io/npm/v/@rokmohar/medusa-plugin-admin-layouts)](https://www.npmjs.com/package/@rokmohar/medusa-plugin-admin-layouts)
[![npm downloads](https://img.shields.io/npm/dm/@rokmohar/medusa-plugin-admin-layouts)](https://www.npmjs.com/package/@rokmohar/medusa-plugin-admin-layouts)
[![CI](https://github.com/rokmohar/medusa-plugin-admin-layouts/actions/workflows/ci.yml/badge.svg)](https://github.com/rokmohar/medusa-plugin-admin-layouts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@rokmohar/medusa-plugin-admin-layouts)](./LICENSE)

Hide, move, reorder and replace the core sections of Medusa admin pages from `medusa-config.ts`, so your admin layout
is versioned with your code and the same on every environment.

- [Why](#why)
- [What you get](#what-you-get)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Zones and ids](#zones-and-ids)
- [Recipes](#recipes)
- [Exporting a layout from the admin](#exporting-a-layout-from-the-admin)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Why

Medusa's admin extensions add new pages and widgets, but they can't change the pages Medusa ships. Since Medusa 2.22,
admins can rearrange page sections in the browser and save the result for themselves or for everyone. That arrangement
lives in the database: it doesn't travel from development to production, and any admin can undo it.

This plugin closes that gap. You declare the layout of a page in code, and the plugin serves it as the page's default
layout for everyone.

## What you get

- **Hide** core sections and widgets, such as the order activity timeline or a sidebar menu item.
- **Move and reorder** sections, also between the main and side columns.
- **Replace** a core section with your own widget, in the exact spot the section had.
- **Lock** hidden sections, so users can't show them again in their personal layout.
- **Export** a layout you arranged in the admin as code, from the plugin's settings page.
- **Validation at boot**: an invalid config stops the server with a clear message, unknown ids are logged as warnings.
- **No database writes**: layouts are applied per request, so a deploy changes them immediately.

## Compatibility

| Plugin   | Medusa   | Node       |
| -------- | -------- | ---------- |
| `~0.1.0` | `2.22.x` | `>= 22.12` |

The plugin ships the section order of every admin page of one Medusa minor version, which replacing and reordering rely
on. On a different minor version it logs a warning and its settings page shows one, because sections may land in the
wrong place. Hiding works regardless.

## Installation

```bash
npm install @rokmohar/medusa-plugin-admin-layouts
# or
yarn add @rokmohar/medusa-plugin-admin-layouts
# or
pnpm add @rokmohar/medusa-plugin-admin-layouts
```

## Quick start

Add the plugin to `medusa-config.ts` and describe the pages you want to change:

```ts
import { defineConfig } from '@medusajs/framework/utils'
import { defineAdminLayouts } from '@rokmohar/medusa-plugin-admin-layouts'

module.exports = defineConfig({
  // ... other config
  plugins: [
    {
      resolve: '@rokmohar/medusa-plugin-admin-layouts',
      options: defineAdminLayouts({
        lock: true,
        zones: {
          'order.details': {
            hide: ['core:OrderActivitySection'],
            replace: { 'core:OrderSummarySection': 'widget:my-store:order-summary' },
            sections: { side: ['core:OrderCustomerSection', 'core:OrderGeneralSection'] },
          },
        },
      }),
    },
  ],
})
```

The replacing widget is a regular admin widget with an explicit `id`:

```tsx
// src/admin/widgets/order-summary.tsx
import { defineWidgetConfig } from '@medusajs/admin-sdk'

const OrderSummary = () => {
  return <div>Your order summary</div>
}

export const config = defineWidgetConfig({
  zone: 'order.details.after',
  id: 'my-store:order-summary',
})

export default OrderSummary
```

Restart the server. On the order page the activity timeline is gone, your widget sits where the summary was, and the
order header moved to the side column under the customer.

## Configuration

`defineAdminLayouts` takes these options:

| Option  | Type                         | Default | Description                                                                  |
| ------- | ---------------------------- | ------- | ---------------------------------------------------------------------------- |
| `lock`  | `boolean`                    | `false` | Keep hidden and replaced sections hidden in users' personal layouts.         |
| `zones` | `Record<string, ZoneLayout>` | `{}`    | The layout of each page, keyed by zone. See [Zones and ids](#zones-and-ids). |

Each `ZoneLayout` takes:

| Option     | Type                       | Description                                                                                                                                                   |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hide`     | `string[]`                 | Sections and widgets to hide.                                                                                                                                 |
| `replace`  | `Record<string, string>`   | Core section → widget. The widget takes the section's spot and the section is hidden.                                                                         |
| `sections` | `Record<string, string[]>` | Layout section (`main`, `side`) → ids to show first, in this order. Listing an id under another section moves it there. The rest follow in their usual order. |
| `lock`     | `boolean`                  | Overrides the top-level `lock` for this zone.                                                                                                                 |

The config is validated when Medusa loads it. These stop the server at boot:

- an id that doesn't start with `core:` or `widget:`
- an id listed under two sections
- one widget replacing two sections
- `replace` on a page the plugin has no section order for (see [Limitations](#limitations))

Ids or sections that the plugin doesn't know for a page are logged as warnings, because a page can render sections only
under some conditions.

## Zones and ids

- **Zone**: a page, named like its widget zones without the position: `order.details`, `product.list`,
  `customer.details`, `topbar`, `sidebar`. **Settings → Admin layouts** lists all of them.
- **Core section**: `core:` followed by the section's id in the dashboard, e.g. `core:OrderSummarySection`. The ids of
  every page are in [`src/catalog/core-entries.ts`](./src/catalog/core-entries.ts). Most detail pages also have
  `core:MetadataSection`, `core:JsonViewSection` and `core:RequiredPermissionsSection`.
- **Widget**: `widget:` followed by the `id` from `defineWidgetConfig`. Give every widget you place an explicit id,
  otherwise Medusa derives one from the file path and it changes when the file moves. Prefix ids with your project or
  plugin name to avoid collisions.

## Recipes

Hide the JSON section on every product page:

```ts
zones: {
  'product.details': { hide: ['core:JsonViewSection'] },
}
```

Move a widget into the side column, above the customer:

```ts
zones: {
  'order.details': { sections: { side: ['widget:my-store:loyalty', 'core:OrderCustomerSection'] } },
}
```

Hide a menu item in the main sidebar:

```ts
zones: {
  sidebar: { hide: ['core:nav:/promotions'] },
}
```

Hide a section for everyone but let users show it again:

```ts
zones: {
  'customer.details': { hide: ['core:CustomerGroupSection'], lock: false },
}
```

## Exporting a layout from the admin

Arranging a page by hand is often easier than writing the config:

1. Open the page and arrange it with the layout customizer in the top bar, then choose **Save for everyone**.
2. Open **Settings → Admin layouts** and click **Copy as code** next to the page, or **Copy all as code**.
3. Paste the copied `zones` into the plugin options.

Once a page is configured in code, changing its default layout with **Save for everyone** is rejected with a message
that the layout is managed in code. Saving it unchanged still works and switches you to the default view. Personal
layouts keep working.

## How it works

The plugin adds a middleware to Medusa's layout endpoint, `GET` and `POST /admin/layouts/:zone/configuration`. For zones
configured in code:

- `GET` returns your layout as the zone's default layout, in the format the admin's layout composer reads. For locked
  zones, the sections you hid are also hidden in the user's personal layout.
- `POST` rejects changes to the default layout. Saving the default unchanged, which is how the admin switches a user to
  the default view, only switches the view and stores nothing. For locked zones, your hidden sections stay hidden in
  a saved personal layout.

Other zones pass through untouched. The plugin also adds `GET /admin/admin-layouts`, which feeds its settings page.

To place a replacing widget or keep the rest of a section in order, the plugin uses a catalog of every page's sections,
generated from the Medusa source of the supported version.

## Limitations

- Only whole sections can be changed. Content inside a section, core pages and their routes can't be replaced by a
  plugin.
- A user's personal layout takes precedence over the default, as in Medusa. Locking keeps hidden sections hidden, but
  doesn't reset the order a user chose.
- Widgets that aren't listed under `sections` appear at the top of their section, which is how Medusa treats entries
  without a saved position. List your widgets to place them.
- The main and settings sidebars build their entries at runtime, so they aren't in the catalog. `hide` works there,
  `replace` doesn't, and `sections` should list every entry you want in a set order.

## Troubleshooting

**My widget doesn't show up where the replaced section was.** Check that the widget's `defineWidgetConfig` has the same
`id` as in `replace`, without the `widget:` prefix, and that it is registered in a zone of the same page, e.g.
`order.details.after`.

**The layout doesn't change for me.** You are probably viewing your personal layout of that page. Open the layout
customizer in the top bar, choose the page, click **Default** and save to switch to the default view.

**"Save for everyone" fails with "managed in code".** The page is configured in `medusa-config.ts` and you changed its
default layout. Change the layout in the config instead, or remove the page from the config, arrange it in the admin
and export it again.

**A warning says the catalog is from another Medusa version.** Upgrade the plugin to the version that matches your Medusa
minor, see [Compatibility](#compatibility).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) and the [GitHub releases](https://github.com/rokmohar/medusa-plugin-admin-layouts/releases).

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the development setup, trying changes
in a Medusa app, supporting a new Medusa version and the pull request checklist. Everyone taking part follows the
[code of conduct](./CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Rok Mohar
