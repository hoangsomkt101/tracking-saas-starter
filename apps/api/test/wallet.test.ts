import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getWalletTopUpReference, getWalletTopUpTransactionReference } from '@repo/db'

describe('wallet top-up references', () => {
  it('creates a different payment reference for each request in one workspace', () => {
    const firstId = '11111111-1111-4111-8111-111111111111'
    const secondId = '22222222-2222-4222-8222-222222222222'

    assert.equal(getWalletTopUpReference('abc12345', firstId), `ATPabc12345-${firstId}`)
    assert.equal(getWalletTopUpReference('abc12345', secondId), `ATPabc12345-${secondId}`)
    assert.notEqual(getWalletTopUpReference('abc12345', firstId), getWalletTopUpReference('abc12345', secondId))
  })

  it('keys the ledger transaction by top-up id instead of payment reference', () => {
    const topUpId = '11111111-1111-4111-8111-111111111111'

    assert.equal(getWalletTopUpTransactionReference(topUpId), `topup:${topUpId}`)
  })
})
