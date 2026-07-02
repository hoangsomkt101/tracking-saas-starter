import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

type Timer = { callback: () => void; delay: number }
type PixelCall = [method: string, eventName: string, data: Record<string, unknown>, options: { eventID: string }]

const serverSource = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8')
const scriptStartMarker = 'return scriptHeaders(allowedOrigin).send(`(() => {\n'
const scriptEndMarker = '\n})();\n`)\n})'

function buildTrackingScript(config: Record<string, unknown>) {
    const start = serverSource.indexOf(scriptStartMarker)
    assert.notEqual(start, -1, 'tracking script start marker is missing')
    const bodyStart = start + scriptStartMarker.length
    const end = serverSource.indexOf(scriptEndMarker, bodyStart)
    assert.notEqual(end, -1, 'tracking script end marker is missing')
    const templateBody = serverSource.slice(bodyStart, end).replace('${JSON.stringify(payload)}', JSON.stringify(config))
    assert.equal(templateBody.includes('${'), false, 'tracking script contains unresolved template interpolation')
    const body = vm.runInNewContext(`\`${templateBody}\``) as string
    return `(() => {\n${body}\n})();`
}

type TrackingLinkConfig = {
    id: string
    brandId: string | null
    slug: string
    affiliateUrl: string
    trackingParamKey: string
    affiliatePlatform: { name: string; slug: string; trackingParamKey: string }
    shortlinkPaths: string[]
}

function executeTrackingScript(linkHref: string | string[], options: { executions?: number; hasFbq?: boolean; trackingLinks?: TrackingLinkConfig[]; uuidPrefix?: string } = {}) {
    const pixelCalls: PixelCall[] = []
    const timers: Timer[] = []
    const windowListeners = new Map<string, Array<() => void>>()
    let mutationCallback: (() => void) | undefined
    let generatedId = 0

    const links = (Array.isArray(linkHref) ? linkHref : [linkHref]).map((href) => ({
        tagName: 'A',
        textContent: 'Affiliate offer',
        href,
        getAttribute(name: string) {
            return name === 'href' ? this.href : null
        },
        setAttribute(name: string, value: string) {
            if (name === 'href') this.href = value
        },
        addEventListener() {}
    }))
    const documentElement = { scrollHeight: 1000 }
    const documentMock = {
        currentScript: { src: 'https://api.example.com/atp.js?property_id=DBG-tenant' },
        location: { href: 'https://publisher.example.com/article?fbclid=test-fbclid' },
        readyState: 'complete',
        title: 'Publisher article',
        referrer: 'https://facebook.example.com/',
        cookie: '_fbp=fb.1.test; _fbc=fb.1.click; _ttp=ttp-test',
        documentElement,
        querySelectorAll(selector: string) {
            if (selector === 'a[href], area[href]') return links
            if (selector === 'form[action]') return []
            return []
        },
        addEventListener() {}
    }
    class MutationObserverMock {
        constructor(callback: () => void) {
            mutationCallback = callback
        }

        observe() {}
    }
    const windowMock = {
        location: documentMock.location,
        document: documentMock,
        crypto: { randomUUID: () => `${options.uuidPrefix ?? 'click'}-${++generatedId}` },
        innerHeight: 250,
        scrollY: 0,
        MutationObserver: MutationObserverMock,
        setTimeout(callback: () => void, delay: number) {
            timers.push({ callback, delay })
            return timers.length
        },
        clearTimeout() {},
        requestAnimationFrame(callback: () => void) {
            callback()
            return 1
        },
        addEventListener(name: string, callback: () => void) {
            const callbacks = windowListeners.get(name) ?? []
            callbacks.push(callback)
            windowListeners.set(name, callbacks)
        }
    }
    if (options.hasFbq !== false) Object.assign(windowMock, { fbq: (...args: PixelCall) => pixelCalls.push(args) })
    const config = {
        propertyId: 'DBG-tenant',
        tenantKey: 'tenant',
        tenantId: 'tenant-id',
        userName: 'Test User',
        eventEndpointPath: '/atp/events?property_id=DBG-tenant',
        trackingLinks: options.trackingLinks ?? [{
            id: 'tracking-link-id',
            brandId: 'brand-id',
            slug: 'offer',
            affiliateUrl: 'https://affiliate.example.com/offer',
            trackingParamKey: 'subid1',
            affiliatePlatform: { name: 'Test', slug: 'test', trackingParamKey: 'subid1' },
            shortlinkPaths: ['/offer/tenant', '/offer/tenant-id']
        }]
    }
    const consoleMock = { log() {}, warn() {}, error() {} }

    const context = { Blob, MutationObserver: MutationObserverMock, URL, console: consoleMock, document: documentMock, window: windowMock }
    for (let execution = 0; execution < (options.executions ?? 1); execution += 1) {
        vm.runInNewContext(buildTrackingScript(config), context)
    }

    return { documentMock, generatedId, links, mutationCallback, pixelCalls, timers, windowListeners, windowMock }
}

function getPixelCall(pixelCalls: PixelCall[], eventName: string) {
    const call = pixelCalls.find((entry) => entry[1] === eventName)
    assert.ok(call, `missing ${eventName} pixel call`)
    return call
}

function toLocalRecord(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

describe('atp.js engagement tracking', () => {
    it('does not start engagement tracking without a matching tracking link', () => {
        const result = executeTrackingScript('https://redirect.example.com/not-a-tracking-link')

        assert.deepEqual(result.pixelCalls, [])
        assert.deepEqual(result.timers, [])
        assert.equal(result.windowListeners.has('scroll'), false)
    })

    it('calls existing fbq for PageView, TimeOnPage, and ScrollDepth after detecting a link', () => {
        const result = executeTrackingScript('https://redirect.example.com/offer/tenant')

        const pageView = getPixelCall(result.pixelCalls, 'PageView')
        assert.equal(pageView[0], 'track')
        assert.deepEqual(toLocalRecord(pageView[2]), {
            url: 'https://publisher.example.com/article?fbclid=test-fbclid',
            referrer: 'https://facebook.example.com/'
        })
        assert.match(pageView[3].eventID, /^PageView_\d+_[a-z0-9]+$/)

        const expectedSeconds = [10, 30, 60, 120, 180]
        assert.deepEqual(result.timers.map((timer) => timer.delay), expectedSeconds.map((seconds) => seconds * 1000))
        for (const seconds of expectedSeconds) {
            result.timers.find((timer) => timer.delay === seconds * 1000)?.callback()
            const eventName = `TimeOnPage_${seconds}_seconds`
            const call = getPixelCall(result.pixelCalls, eventName)
            assert.equal(call[0], 'trackCustom')
            assert.deepEqual(toLocalRecord(call[2]), { time_spent: seconds })
            assert.match(call[3].eventID, new RegExp(`^${eventName}_\\d+_[a-z0-9]+$`))
        }

        const scroll = result.windowListeners.get('scroll')?.[0]
        assert.ok(scroll)
        scroll()
        result.windowMock.scrollY = 500
        scroll()
        result.windowMock.scrollY = 750
        scroll()
        for (const depth of [25, 50, 75, 100]) {
            const eventName = `ScrollDepth_${depth}_percent`
            const call = getPixelCall(result.pixelCalls, eventName)
            assert.equal(call[0], 'trackCustom')
            assert.deepEqual(toLocalRecord(call[2]), { depth })
            assert.match(call[3].eventID, new RegExp(`^${eventName}_\\d+_[a-z0-9]+$`))
        }
    })

    it('starts engagement tracking only once across repeated DOM scans', () => {
        const result = executeTrackingScript('https://redirect.example.com/offer/tenant')
        assert.ok(result.mutationCallback)
        result.mutationCallback()
        result.timers.find((timer) => timer.delay === 250)?.callback()

        assert.equal(result.pixelCalls.filter((call) => call[1] === 'PageView').length, 1)
        assert.equal(result.windowListeners.get('scroll')?.length, 1)
        assert.equal(result.timers.filter((timer) => [10000, 30000, 60000, 120000, 180000].includes(timer.delay)).length, 5)
    })

    it('starts engagement tracking only once when atp.js is loaded more than once', () => {
        const result = executeTrackingScript('https://redirect.example.com/offer/tenant', { executions: 2 })

        assert.equal(result.pixelCalls.filter((call) => call[1] === 'PageView').length, 1)
        assert.equal(result.windowListeners.get('scroll')?.length, 1)
        assert.equal(result.timers.filter((timer) => [10000, 30000, 60000, 120000, 180000].includes(timer.delay)).length, 5)
    })

    it('does not poll or throw when the website has no existing fbq', () => {
        const result = executeTrackingScript('https://redirect.example.com/offer/tenant', { hasFbq: false })
        for (const timer of [...result.timers]) timer.callback()
        result.windowListeners.get('scroll')?.[0]?.()

        assert.deepEqual(result.pixelCalls, [])
        assert.equal(result.timers.filter((timer) => timer.delay === 100).length, 0)
    })

    it('does not inject or initialize Facebook Pixel base code', () => {
        const script = buildTrackingScript({ trackingLinks: [] })

        assert.equal(script.includes('connect.facebook.net'), false)
        assert.equal(script.includes("fbq('init'"), false)
        assert.equal(script.includes('createElement(\'script\')'), false)
    })
})

describe('atp.js affiliate URL decoration', () => {
    it('adds the same page UUID to every duplicate affiliate link', () => {
        const result = executeTrackingScript([
            'https://affiliate.example.com/offer',
            'https://affiliate.example.com/offer'
        ])

        const clickUuids = result.links.map((link) => new URL(link.href).searchParams.get('subid1'))
        assert.deepEqual(clickUuids, ['click-1', 'click-1'])
        assert.equal(result.generatedId, 1)
    })

    it('shares a UUID between tracking links for the same brand', () => {
        const affiliatePlatform = { name: 'Test', slug: 'test', trackingParamKey: 'subid1' }
        const result = executeTrackingScript([
            'https://affiliate.example.com/offer-a',
            'https://affiliate.example.com/offer-b'
        ], {
            trackingLinks: [{
                id: 'tracking-link-a',
                brandId: 'shared-brand-id',
                slug: 'offer-a',
                affiliateUrl: 'https://affiliate.example.com/offer-a',
                trackingParamKey: 'subid1',
                affiliatePlatform,
                shortlinkPaths: ['/offer-a/tenant', '/offer-a/tenant-id']
            }, {
                id: 'tracking-link-b',
                brandId: 'shared-brand-id',
                slug: 'offer-b',
                affiliateUrl: 'https://affiliate.example.com/offer-b',
                trackingParamKey: 'subid1',
                affiliatePlatform,
                shortlinkPaths: ['/offer-b/tenant', '/offer-b/tenant-id']
            }]
        })

        const clickUuids = result.links.map((link) => new URL(link.href).searchParams.get('subid1'))
        assert.deepEqual(clickUuids, ['click-1', 'click-1'])
        assert.equal(result.generatedId, 1)
    })

    it('creates a new brand UUID after a page reload', () => {
        const firstPage = executeTrackingScript('https://affiliate.example.com/offer', { uuidPrefix: 'first-page' })
        const secondPage = executeTrackingScript('https://affiliate.example.com/offer', { uuidPrefix: 'second-page' })

        assert.equal(new URL(firstPage.links[0].href).searchParams.get('subid1'), 'first-page-1')
        assert.equal(new URL(secondPage.links[0].href).searchParams.get('subid1'), 'second-page-1')
        assert.equal(secondPage.generatedId, 1)
    })

    it('restores the same UUID when a rendered link resets its href', () => {
        const result = executeTrackingScript('https://affiliate.example.com/offer')
        result.links[0].href = 'https://affiliate.example.com/offer'

        assert.ok(result.mutationCallback)
        result.mutationCallback()
        result.timers.find((timer) => timer.delay === 250)?.callback()

        assert.equal(new URL(result.links[0].href).searchParams.get('subid1'), 'click-1')
        assert.equal(result.generatedId, 1)
    })

    it('uses different UUIDs for different brands', () => {
        const affiliatePlatform = { name: 'Test', slug: 'test', trackingParamKey: 'subid1' }
        const result = executeTrackingScript([
            'https://affiliate.example.com/offer-a',
            'https://affiliate.example.com/offer-b'
        ], {
            trackingLinks: [{
                id: 'tracking-link-a',
                brandId: 'brand-a',
                slug: 'offer-a',
                affiliateUrl: 'https://affiliate.example.com/offer-a',
                trackingParamKey: 'subid1',
                affiliatePlatform,
                shortlinkPaths: ['/offer-a/tenant', '/offer-a/tenant-id']
            }, {
                id: 'tracking-link-b',
                brandId: 'brand-b',
                slug: 'offer-b',
                affiliateUrl: 'https://affiliate.example.com/offer-b',
                trackingParamKey: 'subid1',
                affiliatePlatform,
                shortlinkPaths: ['/offer-b/tenant', '/offer-b/tenant-id']
            }]
        })

        const clickUuids = result.links.map((link) => new URL(link.href).searchParams.get('subid1'))
        assert.deepEqual(clickUuids, ['click-1', 'click-2'])
    })
})
