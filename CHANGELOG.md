# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-29

### Added

- TypeScript types for page names and section ids: `defineAdminLayouts` suggests the zones and `core:` ids of the
  supported Medusa version, and an id that doesn't exist on a page is a type error. The types `CatalogZone`,
  `CoreEntryId`, `SectionName`, `WidgetId` and `ZoneLayoutInput` are exported.
- **Settings → Admin layouts** lists each page's sections with their ids in their current order, each with a copy
  button.
- **Settings → Admin layouts** has a search, and shows only customized pages unless **Show pages with Medusa's default
  layout** is on.

### Changed

- **Copy as code** output is formatted like Prettier formats `medusa-config.ts` with single quotes, so it pastes
  without reformatting.
- The settings page has an "Admin layouts" breadcrumb.

## [0.1.0] - 2026-10-29

### Added

- `defineAdminLayouts` to hide, move, reorder and replace core sections of admin pages from `medusa-config.ts`,
  validated at boot.
- `lock` option that keeps hidden and replaced sections hidden in users' personal layouts.
- **Settings → Admin layouts** page that lists every page's layout source and copies layouts saved in the admin as code.
- Section catalog of Medusa 2.22.1 admin pages, generated with `yarn catalog`.

[0.1.1]: https://github.com/rokmohar/medusa-plugin-admin-layouts/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rokmohar/medusa-plugin-admin-layouts/releases/tag/v0.1.0
