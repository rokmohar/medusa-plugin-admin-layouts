import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CORE_ENTRIES } from '../../src/catalog/core-entries'
import { compileZoneLayout, getLockedIds, hideIds, samePreference } from '../../src/lib/compile'
import { defineAdminLayouts, getCatalogWarnings } from '../../src/lib/config'
import { exportZoneLayout } from '../../src/lib/export'

const catalog = {
  page: {
    main: ['core:A', 'core:B', 'core:C'],
    side: ['core:D', 'core:E'],
  },
}

describe('compileZoneLayout', () => {
  it('keeps the natural order and hides entries', () => {
    assert.deepEqual(compileZoneLayout('page', { hide: ['core:B'] }, catalog).widgets, {
      'core:A': { section: 'main', order: 1 },
      'core:B': { section: 'main', order: 2, hidden: true },
      'core:C': { section: 'main', order: 3 },
      'core:D': { section: 'side', order: 1 },
      'core:E': { section: 'side', order: 2 },
    })
  })

  it('puts a replacing widget in the core entry spot and hides the core entry behind it', () => {
    const { widgets } = compileZoneLayout('page', { replace: { 'core:B': 'widget:my-b' } }, catalog)

    assert.deepEqual(widgets['widget:my-b'], { section: 'main', order: 2 })
    assert.deepEqual(widgets['core:B'], { section: 'main', order: 3, hidden: true })
    assert.deepEqual(widgets['core:C'], { section: 'main', order: 4 })
  })

  it('lists entries first and moves them across sections', () => {
    const { widgets } = compileZoneLayout('page', { sections: { side: ['core:A', 'widget:w', 'core:E'] } }, catalog)

    assert.deepEqual(widgets['core:A'], { section: 'side', order: 1 })
    assert.deepEqual(widgets['widget:w'], { section: 'side', order: 2 })
    assert.deepEqual(widgets['core:E'], { section: 'side', order: 3 })
    assert.deepEqual(widgets['core:D'], { section: 'side', order: 4 })
    assert.deepEqual(widgets['core:B'], { section: 'main', order: 1 })
    assert.deepEqual(widgets['core:C'], { section: 'main', order: 2 })
  })

  it('only uses listed entries for zones outside the catalog', () => {
    assert.deepEqual(
      compileZoneLayout('sidebar', { hide: ['core:nav:/promotions'], sections: { main: ['core:Searchbar'] } }, catalog)
        .widgets,
      {
        'core:Searchbar': { section: 'main', order: 1 },
        'core:nav:/promotions': { hidden: true },
      },
    )
  })

  it('places a widget where the order summary was on the real order page', () => {
    const { widgets } = compileZoneLayout('order.details', {
      replace: { 'core:OrderSummarySection': 'widget:order-summary' },
    })
    const main = Object.entries(widgets)
      .filter(([, pref]) => {
        return pref.section === 'main' && !pref.hidden
      })
      .sort(([, a], [, b]) => {
        return (a.order ?? 0) - (b.order ?? 0)
      })
      .map(([id]) => {
        return id
      })

    assert.equal(main[main.indexOf('core:OrderGeneralSection') + 1], 'widget:order-summary')
    assert.equal(main[main.indexOf('widget:order-summary') + 1], 'core:OrderPaymentSection')
  })
})

describe('lock', () => {
  it('locks hidden and replaced entries', () => {
    assert.deepEqual(getLockedIds({ hide: ['core:A'], replace: { 'core:B': 'widget:b', 'core:A': 'widget:a' } }), [
      'core:A',
      'core:B',
    ])
  })

  it('hides locked entries in a personal layout without touching the rest', () => {
    assert.deepEqual(
      hideIds({ widgets: { 'core:A': { order: 2, hidden: false }, 'core:C': { order: 1 } } }, ['core:A', 'core:B']),
      {
        widgets: {
          'core:A': { order: 2, hidden: true },
          'core:B': { hidden: true },
          'core:C': { order: 1 },
        },
      },
    )
  })
})

describe('samePreference', () => {
  it('treats a missing hidden flag as visible', () => {
    assert.ok(
      samePreference({ widgets: { 'core:A': { order: 1 } } }, { widgets: { 'core:A': { order: 1, hidden: false } } }),
    )
  })

  it('detects a changed order, section or visibility', () => {
    const base = { widgets: { 'core:A': { order: 1, section: 'main' } } }

    assert.ok(!samePreference(base, { widgets: { 'core:A': { order: 2, section: 'main' } } }))
    assert.ok(!samePreference(base, { widgets: { 'core:A': { order: 1, section: 'side' } } }))
    assert.ok(!samePreference(base, { widgets: { 'core:A': { order: 1, section: 'main', hidden: true } } }))
  })
})

describe('exportZoneLayout', () => {
  it('compiles back to the same layout', () => {
    const layout = { replace: { 'core:B': 'widget:my-b' }, sections: { side: ['core:A'] }, hide: ['core:E'] }
    const compiled = compileZoneLayout('page', layout, catalog)

    assert.deepEqual(compileZoneLayout('page', exportZoneLayout('page', compiled, catalog), catalog), compiled)
  })

  it('leaves out sections in their natural order', () => {
    assert.deepEqual(exportZoneLayout('page', compileZoneLayout('page', { hide: ['core:C'] }, catalog), catalog), {
      hide: ['core:C'],
    })
  })

  it('uses the catalog section for entries saved without one', () => {
    assert.deepEqual(
      exportZoneLayout(
        'page',
        { widgets: { 'core:B': { order: 1 }, 'core:A': { order: 2 }, 'core:C': { order: 3 } } },
        catalog,
      ),
      { sections: { main: ['core:B', 'core:A', 'core:C'] } },
    )
  })
})

describe('exportZoneLayout ordering', () => {
  it('sorts entries without a saved order like the dashboard does', () => {
    assert.deepEqual(
      exportZoneLayout(
        'page',
        { widgets: { 'core:C': { order: 0 }, 'core:A': { order: 1 }, 'widget:w': { section: 'main' } } },
        catalog,
      ),
      { sections: { main: ['core:B', 'core:C', 'widget:w', 'core:A'] } },
    )
  })
})

describe('defineAdminLayouts', () => {
  it('applies defaults', () => {
    assert.deepEqual(defineAdminLayouts({}), { lock: false, zones: {} })
  })

  it('rejects malformed ids', () => {
    assert.throws(() => {
      return defineAdminLayouts({ zones: { 'order.details': { hide: ['OrderSummarySection'] } } })
    }, /order\.details > hide > 0: Entry ids start with "core:"/)
  })

  it('rejects an entry listed in two sections', () => {
    assert.throws(() => {
      return defineAdminLayouts({ zones: { 'order.details': { sections: { main: ['core:X'], side: ['core:X'] } } } })
    }, /already listed in section "main"/)
  })

  it('rejects one widget replacing two entries', () => {
    assert.throws(() => {
      return defineAdminLayouts({
        zones: { 'order.details': { replace: { 'core:A': 'widget:w', 'core:B': 'widget:w' } } },
      })
    }, /only one core entry/)
  })

  it('rejects replace in zones outside the catalog', () => {
    assert.ok(!CORE_ENTRIES.sidebar)
    assert.throws(() => {
      return defineAdminLayouts({ zones: { sidebar: { replace: { 'core:Searchbar': 'widget:search' } } } })
    }, /not in the core entry catalog/)
  })

  it('warns about unknown core entries and sections', () => {
    assert.deepEqual(getCatalogWarnings('order.details', { hide: ['core:Nope'], sections: { aside: [] } }), [
      '"core:Nope" is not a known core entry of "order.details"',
      '"aside" is not a section of "order.details" (known: main, side)',
    ])
  })
})
