import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    getImpactActionTrackerAmountValue,
    getImpactCapiValue,
    getImpactEventMatch,
    getImpactPayoutNumber,
    isImpactPostbackPayload,
    parseMoneyNumber,
    resolveImpactEventNames
} from '@repo/shared'

type ImpactFixture = {
    name: string
    actionTrackerName: string
    amount: string
    payout: string
    expectedEventNames: string[]
    expectedActionValue: number
}

function makeImpactPayload(actionTrackerName: string, amount: string, payout: string) {
    return {
        SubId1: 'test-click-uuid',
        CampaignId: '25666',
        CampaignName: 'Crypto.com Affiliates',
        ActionTrackerId: '47334',
        ActionTrackerName: actionTrackerName,
        Amount: amount,
        Payout: payout,
        RefClickId: 'impact-ref-click-id'
    }
}

const actionNames = [
    'Verified email',
    'Verified phone',
    'iOS',
    'KYC Success',
    'Android',
    'First Transaction',
    '30 Day Activity',
    'Daily transactions',
    'Card opening'
]

const amountPayoutMatrix = [
    { suffix: 'A0P0', amount: '0.00', payout: '0.00', expectedPrimaryEvent: 'CompleteRegistration', hasPayoutEvent: false, expectedActionValue: 0 },
    { suffix: 'A1P0', amount: '1.00', payout: '0.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: false, expectedActionValue: 1 },
    { suffix: 'A0P1', amount: '0.00', payout: '1.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: true, expectedActionValue: 0 },
    { suffix: 'A1P1', amount: '1.00', payout: '1.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: true, expectedActionValue: 1 },
    { suffix: 'A100P0', amount: '100.00', payout: '0.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: false, expectedActionValue: 100 },
    { suffix: 'A0P100', amount: '0.00', payout: '100.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: true, expectedActionValue: 0 },
    { suffix: 'A100P50', amount: '100.00', payout: '50.00', expectedPrimaryEvent: 'Purchase', hasPayoutEvent: true, expectedActionValue: 100 }
]

const matrixFixtures: ImpactFixture[] = actionNames.flatMap((actionTrackerName) =>
    amountPayoutMatrix.map((entry) => ({
        name: `${actionTrackerName} ${entry.suffix}`,
        actionTrackerName,
        amount: entry.amount,
        payout: entry.payout,
        expectedEventNames: [entry.expectedPrimaryEvent, ...(entry.hasPayoutEvent ? ['Payout'] : []), actionTrackerName],
        expectedActionValue: entry.expectedActionValue
    }))
)

const sourceFixtures: ImpactFixture[] = [
    {
        name: 'Base44 Purchase payout > 0 from test/impact.md',
        actionTrackerName: 'Purchase',
        amount: '0.00',
        payout: '100.00',
        expectedEventNames: ['Purchase', 'Payout'],
        expectedActionValue: 0
    },
    {
        name: 'Base44 Sign Up amount/payout = 0 from test/impact.md',
        actionTrackerName: 'Sign Up',
        amount: '0.00',
        payout: '0.00',
        expectedEventNames: ['CompleteRegistration', 'Sign Up'],
        expectedActionValue: 0
    },
    {
        name: 'Crypto.com iOS amount/payout = 0 from test/impact.md',
        actionTrackerName: 'iOS',
        amount: '0.00',
        payout: '0.00',
        expectedEventNames: ['CompleteRegistration', 'iOS'],
        expectedActionValue: 0
    }
]

describe('Impact postback helpers', () => {
    it('parses Impact money string values before comparison', () => {
        assert.equal(parseMoneyNumber('0.00'), 0)
        assert.equal(parseMoneyNumber('100.00'), 100)
        assert.equal(parseMoneyNumber('1,234.56'), 1234.56)
        assert.equal(parseMoneyNumber('$50.25'), 50.25)
        assert.equal(parseMoneyNumber('not-a-number'), undefined)
    })

    for (const fixture of [...matrixFixtures, ...sourceFixtures]) {
        it(`resolves event names and ActionTrackerName Amount value: ${fixture.name}`, () => {
            const payload = makeImpactPayload(fixture.actionTrackerName, fixture.amount, fixture.payout)
            const primaryEvent = getImpactEventMatch(payload)

            assert.equal(isImpactPostbackPayload(payload), true)
            assert.ok(primaryEvent)
            assert.deepEqual(resolveImpactEventNames(payload, primaryEvent.eventName), fixture.expectedEventNames)
            assert.equal(getImpactActionTrackerAmountValue(payload, fixture.actionTrackerName), fixture.expectedActionValue)
        })
    }

    it('sends CompleteRegistration plus ActionTrackerName when Amount=0 and Payout=0', () => {
        const payload = makeImpactPayload('install', '0.00', '0.00')
        const primaryEvent = getImpactEventMatch(payload)

        assert.equal(primaryEvent?.eventName, 'CompleteRegistration')
        assert.deepEqual(resolveImpactEventNames(payload, primaryEvent?.eventName ?? ''), ['CompleteRegistration', 'install'])
        assert.equal(getImpactActionTrackerAmountValue(payload, 'install'), 0)
    })

    it('sends Purchase, Payout, and ActionTrackerName when Amount=0 and Payout>0', () => {
        const payload = makeImpactPayload('install', '0.00', '1.00')
        const primaryEvent = getImpactEventMatch(payload)

        assert.equal(primaryEvent?.eventName, 'Purchase')
        assert.equal(getImpactPayoutNumber(payload), 1)
        assert.deepEqual(resolveImpactEventNames(payload, primaryEvent?.eventName ?? ''), ['Purchase', 'Payout', 'install'])
        assert.equal(getImpactActionTrackerAmountValue(payload, 'install'), 0)
    })

    it('dedupes event names when ActionTrackerName equals primary event name', () => {
        const payload = makeImpactPayload('Purchase', '0.00', '100.00')
        const primaryEvent = getImpactEventMatch(payload)

        assert.equal(primaryEvent?.eventName, 'Purchase')
        assert.deepEqual(resolveImpactEventNames(payload, primaryEvent?.eventName ?? ''), ['Purchase', 'Payout'])
        assert.equal(getImpactActionTrackerAmountValue(payload, 'Purchase'), 0)
    })

    it('keeps normal CAPI value priority as Payout before Amount for Impact base enrichment', () => {
        const payoutOnly = makeImpactPayload('Payout Test', '0.00', '100.00')
        const amountOnly = makeImpactPayload('Amount Test', '25.00', '0.00')

        assert.equal(getImpactCapiValue(payoutOnly), '100')
        assert.equal(getImpactCapiValue(amountOnly), '25')
    })
})
