import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertSubscriptionAccess, assertSubscriptionAssignable, getWalletTopUpReference, getWalletTopUpTransactionReference, requireVndCurrency } from '@repo/db'

describe('wallet top-up references', () => {
  it('creates a different payment reference for each request in one workspace', () => {
    const firstId = '11111111-1111-4111-8111-111111111111'
    const secondId = '22222222-2222-4222-8222-222222222222'
    const firstReference = getWalletTopUpReference('abc12345', firstId)
    const secondReference = getWalletTopUpReference('abc12345', secondId)

    assert.equal(firstReference, 'ATPabc12345111111111111')
    assert.equal(secondReference, 'ATPabc12345222222222222')
    assert.match(firstReference, /^ATPabc12345[a-f0-9]{12}$/)
    assert.equal(firstReference.length, 23)
    assert.notEqual(firstReference, secondReference)
  })

  it('keys the ledger transaction by top-up id instead of payment reference', () => {
    const topUpId = '11111111-1111-4111-8111-111111111111'

    assert.equal(getWalletTopUpTransactionReference(topUpId), `topup:${topUpId}`)
  })
})

describe('wallet billing invariants', () => {
  it('only accepts VND for wallet-funded subscriptions and top-ups', () => {
    assert.equal(requireVndCurrency(' vnd ', 'Subscription'), 'VND')
    assert.throws(() => requireVndCurrency('USD', 'Subscription'), /Subscription currency must be VND/)
    assert.throws(() => requireVndCurrency('USD', 'Wallet top-up'), /Wallet top-up currency must be VND/)
  })

  it('blocks past-due tenants from subscription-backed processing', () => {
    assert.doesNotThrow(() => assertSubscriptionAccess('ACTIVE'))
    assert.throws(() => assertSubscriptionAccess('PAST_DUE'), /Subscription payment overdue/)
  })

  it('only assigns active VND subscriptions', () => {
    assert.equal(assertSubscriptionAssignable({ isActive: true, currency: 'VND' }), 'VND')
    assert.throws(() => assertSubscriptionAssignable({ isActive: false, currency: 'VND' }), /must be active/)
    assert.throws(() => assertSubscriptionAssignable({ isActive: true, currency: 'USD' }), /currency must be VND/)
  })
})
