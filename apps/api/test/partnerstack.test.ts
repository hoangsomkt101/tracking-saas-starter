import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    getPartnerStackCapiEnrichment,
    getPartnerStackClickUuid,
    getPartnerStackConversionMoney,
    getPartnerStackCustomerEmail,
    getPartnerStackCustomerId,
    getPartnerStackEventDate,
    getPartnerStackEventMatch,
    getPartnerStackFieldMap,
    getPartnerStackIdempotencyKey,
    getSupportedAffiliatePlatformParamKey
} from '@repo/shared'

const clickUuid = '8ecd4270-989e-4eb3-9345-9bebf99a8c98'

function makeCustomerUpdatedPayload(updatedAt = 1778779035345) {
    return {
        event: 'customer.updated',
        data: {
            key: 'cus_AcOLfPJYaM7mfF',
            sub_ids: [clickUuid],
            has_paid: true,
            customer_name: '006c55d38d164e2ca31be397a69304b2',
            customer_email: '006c55d38d164e2ca31be397a69304b2@email.com',
            fields: [
                { api_name: 'name', value: '006c55d38d164e2ca31be397a69304b2' },
                { api_name: 'email', value: '006c55d38d164e2ca31be397a69304b2@email.com' },
                { api_name: 'company_name', value: null },
                { api_name: 'source_type', value: 'link' }
            ],
            created_at: 1778778601000,
            updated_at: updatedAt
        },
        test: false
    }
}

function makeTransactionPayload() {
    return {
        event: 'transaction.created',
        data: {
            amount: 660,
            currency: 'USD',
            amount_usd: 660,
            customer: {
                key: 'cus_AcOLfPJYaM7mfF',
                sub_ids: [clickUuid]
            },
            key: 'ch_3TX2p4LmdOdiMXBs1S7cEV4Y',
            created_at: 1778779035165,
            updated_at: 1778779035182
        },
        test: false
    }
}

function makeRewardPayload() {
    return {
        event: 'reward.created',
        data: {
            customer: {
                key: 'cus_AcOLfPJYaM7mfF',
                sub_ids: [clickUuid],
                email: 'buyer@example.com'
            },
            source: {
                type: 'transaction',
                key: 'ch_3TX2p4LmdOdiMXBs1S7cEV4Y'
            },
            transaction: {
                currency: 'USD',
                amount: 660,
                amount_usd: 660
            },
            amount: 145,
            currency: 'USD',
            key: 'rwrd_GivmMOp9cvu26w',
            created_at: 1786555035165,
            updated_at: 1778779102063
        },
        test: false
    }
}

describe('PartnerStack postback helpers', () => {
    it('uses sid1 as PartnerStack tracking parameter', () => {
        assert.equal(getSupportedAffiliatePlatformParamKey('partnerstack'), 'sid1')
        assert.equal(getSupportedAffiliatePlatformParamKey('sid1'), 'sid1')
        assert.equal(getSupportedAffiliatePlatformParamKey('sid'), 'sid1')
    })

    it('extracts customer updated attribution fields and stable CompleteRegistration idempotency', () => {
        const payload = makeCustomerUpdatedPayload()
        const fields = getPartnerStackFieldMap(payload)
        const match = getPartnerStackEventMatch(payload)
        const eventDate = getPartnerStackEventDate(payload)
        const enrichment = getPartnerStackCapiEnrichment(payload, 'CompleteRegistration', clickUuid)

        assert.equal(getPartnerStackClickUuid(payload), clickUuid)
        assert.equal(getPartnerStackCustomerId(payload), 'cus_AcOLfPJYaM7mfF')
        assert.equal(getPartnerStackCustomerEmail(payload), '006c55d38d164e2ca31be397a69304b2@email.com')
        assert.equal(fields.email, '006c55d38d164e2ca31be397a69304b2@email.com')
        assert.equal(fields.source_type, 'link')
        assert.equal(match?.eventName, 'CompleteRegistration')
        assert.equal(getPartnerStackIdempotencyKey(payload, 'CompleteRegistration', clickUuid), 'partnerstack:complete_registration:cus_AcOLfPJYaM7mfF')
        assert.equal(getPartnerStackIdempotencyKey(makeCustomerUpdatedPayload(1778779999999), 'CompleteRegistration', clickUuid), 'partnerstack:complete_registration:cus_AcOLfPJYaM7mfF')
        assert.equal(getPartnerStackIdempotencyKey({ ...payload, data: { ...payload.data, sub_ids: [] } }, 'CompleteRegistration'), 'partnerstack:complete_registration:cus_AcOLfPJYaM7mfF')
        assert.equal(eventDate?.field, 'data.created_at')
        assert.equal(eventDate?.date.getTime(), 1778778601000)
        assert.equal(enrichment?.eventTimeMs, 1778778601000)
        assert.equal(enrichment?.eventId, `CompleteRegistration_${clickUuid}`)
    })

    it('maps transaction.created to Purchase with nested click id and order amount', () => {
        const payload = makeTransactionPayload()
        const match = getPartnerStackEventMatch(payload)
        const money = getPartnerStackConversionMoney(payload)
        const enrichment = getPartnerStackCapiEnrichment(payload, 'Purchase', clickUuid)

        assert.equal(getPartnerStackClickUuid(payload), clickUuid)
        assert.equal(getPartnerStackCustomerId(payload), 'cus_AcOLfPJYaM7mfF')
        assert.equal(match?.eventName, 'Purchase')
        assert.equal(money?.payoutAmount, '6.6')
        assert.equal(money?.currency, 'USD')
        assert.equal(enrichment?.value, 6.6)
        assert.equal(enrichment?.orderId, 'ch_3TX2p4LmdOdiMXBs1S7cEV4Y')
        assert.equal(enrichment?.eventTimeMs, 1778779035165)
        assert.equal(enrichment?.eventId, 'Purchase_ch_3TX2p4LmdOdiMXBs1S7cEV4Y')
    })

    it('maps reward.created to Payout with commission value and source transaction id', () => {
        const payload = makeRewardPayload()
        const match = getPartnerStackEventMatch(payload)
        const money = getPartnerStackConversionMoney(payload)
        const enrichment = getPartnerStackCapiEnrichment(payload, 'Payout', clickUuid)

        assert.equal(getPartnerStackClickUuid(payload), clickUuid)
        assert.equal(getPartnerStackCustomerId(payload), 'cus_AcOLfPJYaM7mfF')
        assert.equal(match?.eventName, 'Payout')
        assert.equal(money?.commissionAmount, '1.45')
        assert.equal(money?.currency, 'USD')
        assert.equal(enrichment?.value, 1.45)
        assert.equal(enrichment?.orderValue, 6.6)
        assert.equal(enrichment?.orderId, 'ch_3TX2p4LmdOdiMXBs1S7cEV4Y')
        assert.equal(enrichment?.eventTimeMs, 1786555035165)
        assert.equal(enrichment?.eventId, 'Payout_rwrd_GivmMOp9cvu26w')
    })
})
