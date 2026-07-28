import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './client.js'

type DbClient = Prisma.TransactionClient | typeof prisma

export type SubscriptionBillingResult = {
  tenantId: string
  state: 'charged' | 'insufficient_funds' | 'not_due' | 'not_billable'
  amountCents?: number
  balanceCents?: number
  currency?: string
  subscriptionId?: string
  subscriptionName?: string
  transactionId?: string
  statusChanged?: boolean
}

function addCalendarMonth(value: Date) {
  const targetYear = value.getUTCFullYear()
  const targetMonth = value.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(value.getUTCDate(), lastDay), value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(), value.getUTCMilliseconds()))
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase()
}

export function getWalletTopUpReference(publicKey: string, topUpId: string) {
  return `ATP${publicKey}-${topUpId}`
}

export function getWalletTopUpTransactionReference(topUpId: string) {
  return `topup:${topUpId}`
}

async function runSerializable<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
    }
  }

  throw new Error('Wallet transaction failed')
}

async function createWalletIfMissing(db: DbClient, tenantId: string, currency: string) {
  return db.wallet.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, currency: normalizeCurrency(currency) }
  })
}

async function ensureWalletCurrency(db: DbClient, wallet: { id: string; balanceCents: number; currency: string }, currency: string) {
  const normalizedCurrency = normalizeCurrency(currency)
  if (wallet.currency === normalizedCurrency) return wallet
  if (wallet.balanceCents !== 0) throw new Error('Wallet currency must match subscription currency while balance is not zero')
  return db.wallet.update({ where: { id: wallet.id }, data: { currency: normalizedCurrency } })
}

export async function getOrCreateTenantWallet(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { select: { currency: true } } }
  })

  if (!tenant) throw new Error('Tenant not found')
  return createWalletIfMissing(prisma, tenantId, tenant.subscription?.currency ?? 'VND')
}

export async function getWalletOverview(tenantId: string) {
  const wallet = await getOrCreateTenantWallet(tenantId)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: true,
      walletTopUps: { orderBy: { createdAt: 'desc' }, take: 25 },
      walletTransactions: { orderBy: { createdAt: 'desc' }, take: 50 }
    }
  })

  if (!tenant) throw new Error('Tenant not found')
  return { wallet, tenant }
}

export async function createWalletTopUp(input: {
  tenantId: string
  amountCents: number
  currency?: string
  paymentMethod?: string
  paymentReference?: string
  note?: string
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('amountCents must be a positive integer')

  const requestedCurrency = normalizeCurrency(input.currency ?? 'VND')
  if (requestedCurrency !== 'VND') throw new Error('Wallet top-ups must use VND')
  const wallet = await getOrCreateTenantWallet(input.tenantId)
  if (wallet.currency !== 'VND' && wallet.balanceCents !== 0) throw new Error('Wallet must be migrated to VND before accepting SePay top-ups')
  const currency = (await ensureWalletCurrency(prisma, wallet, requestedCurrency)).currency
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { publicKey: true } })
  if (!tenant) throw new Error('Tenant not found')
  const pendingTopUp = await prisma.walletTopUp.findFirst({ where: { tenantId: input.tenantId, status: 'PENDING' }, select: { id: true } })
  if (pendingTopUp) throw new Error('A pending wallet top-up already exists for this workspace')
  const topUpId = randomUUID()

  try {
    return await prisma.walletTopUp.create({
      data: {
        id: topUpId,
        tenantId: input.tenantId,
        amountCents: input.amountCents,
        currency,
        paymentMethod: input.paymentMethod?.trim() || 'bank_transfer',
        paymentReference: input.paymentReference?.trim() || null,
        note: input.note?.trim() || null,
        reference: getWalletTopUpReference(tenant.publicKey, topUpId)
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new Error('A pending wallet top-up already exists for this workspace')
    throw error
  }
}

export async function approveWalletTopUp(topUpId: string, approvedByUserId: string | null, options: {
  paymentProvider?: string
  providerTransactionId?: string
  providerReferenceCode?: string
  paymentReceivedAt?: Date
} = {}) {
  const result = await runSerializable(async (tx) => {
    if (options.providerTransactionId) {
      const existingPayment = await tx.walletTopUp.findUnique({ where: { providerTransactionId: options.providerTransactionId } })
      if (existingPayment) {
        if (existingPayment.id === topUpId) return { topUp: existingPayment, transaction: null, alreadyProcessed: true }
        throw new Error('Payment transaction has already been used')
      }
    }

    const topUp = await tx.walletTopUp.findUnique({ where: { id: topUpId } })
    if (!topUp) throw new Error('Wallet top-up not found')
    if (topUp.status !== 'PENDING') return { topUp, transaction: null, alreadyProcessed: true }

    const wallet = await createWalletIfMissing(tx, topUp.tenantId, topUp.currency)
    await ensureWalletCurrency(tx, wallet, topUp.currency)
    const updatedWallet = await tx.wallet.update({ where: { id: wallet.id }, data: { balanceCents: { increment: topUp.amountCents } } })
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: updatedWallet.id,
        tenantId: topUp.tenantId,
        type: 'TOP_UP',
        amountCents: topUp.amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        currency: updatedWallet.currency,
        description: `Wallet top-up ${topUp.reference}`,
        reference: getWalletTopUpTransactionReference(topUp.id)
      }
    })
    const approvedTopUp = await tx.walletTopUp.update({
      where: { id: topUp.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByUserId,
        walletTransactionId: transaction.id,
        paymentProvider: options.paymentProvider ?? topUp.paymentProvider,
        paymentReference: options.providerReferenceCode ?? topUp.paymentReference,
        providerTransactionId: options.providerTransactionId ?? topUp.providerTransactionId,
        providerReferenceCode: options.providerReferenceCode ?? topUp.providerReferenceCode,
        paymentReceivedAt: options.paymentReceivedAt ?? topUp.paymentReceivedAt
      }
    })
    await tx.activityLog.create({
      data: {
        tenantId: topUp.tenantId,
        source: 'billing',
        eventType: 'wallet.top_up_approved',
        message: `Wallet top-up ${topUp.reference} was approved`,
        entityType: 'walletTopUp',
        entityId: topUp.id,
        metadata: { topUpId: topUp.id, transactionId: transaction.id, amountCents: topUp.amountCents, currency: topUp.currency, approvedByUserId, paymentProvider: options.paymentProvider, providerTransactionId: options.providerTransactionId, providerReferenceCode: options.providerReferenceCode }
      }
    })

    return { topUp: approvedTopUp, transaction, alreadyProcessed: false }
  })

  const billing = await billTenantSubscription(result.topUp.tenantId)
  return { ...result, billing }
}

export async function rejectWalletTopUp(topUpId: string, rejectionReason?: string) {
  return runSerializable(async (tx) => {
    const topUp = await tx.walletTopUp.findUnique({ where: { id: topUpId } })
    if (!topUp) throw new Error('Wallet top-up not found')
    if (topUp.status !== 'PENDING') return { topUp, alreadyProcessed: true }
    const rejectedTopUp = await tx.walletTopUp.update({
      where: { id: topUp.id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: rejectionReason?.trim() || null }
    })
    return { topUp: rejectedTopUp, alreadyProcessed: false }
  })
}

export async function activateTenantSubscription(tenantId: string, subscriptionId: string) {
  await runSerializable(async (tx) => {
    const [tenant, subscription] = await Promise.all([
      tx.tenant.findUnique({ where: { id: tenantId }, include: { wallet: true } }),
      tx.subscription.findUnique({ where: { id: subscriptionId } })
    ])
    if (!tenant) throw new Error('Tenant not found')
    if (!subscription) throw new Error('Subscription not found')

    const wallet = tenant.wallet ?? await createWalletIfMissing(tx, tenant.id, subscription.currency)
    await ensureWalletCurrency(tx, wallet, subscription.currency)
    const now = new Date()
    const isPaid = subscription.monthlyPriceCents > 0
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionId,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartedAt: now,
        subscriptionPeriodStartAt: null,
        subscriptionPeriodEndAt: null,
        subscriptionNextBillingAt: isPaid ? now : null
      }
    })
  })

  return billTenantSubscription(tenantId)
}

export async function billTenantSubscription(tenantId: string, now = new Date()): Promise<SubscriptionBillingResult> {
  return runSerializable(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: true, wallet: true }
    })
    if (!tenant) throw new Error('Tenant not found')

    const subscription = tenant.subscription
    if (!subscription || !subscription.isActive || subscription.monthlyPriceCents <= 0) {
      return { tenantId, state: 'not_billable' }
    }

    const dueAt = tenant.subscriptionNextBillingAt ?? now
    if (dueAt > now) return { tenantId, state: 'not_due', subscriptionId: subscription.id, subscriptionName: subscription.name }

    const wallet = tenant.wallet ?? await createWalletIfMissing(tx, tenant.id, subscription.currency)
    const normalizedCurrency = normalizeCurrency(subscription.currency)
    const activeWallet = await ensureWalletCurrency(tx, wallet, normalizedCurrency)
    const amountCents = subscription.monthlyPriceCents
    if (activeWallet.balanceCents < amountCents) {
      const statusChanged = tenant.subscriptionStatus !== 'PAST_DUE'
      if (statusChanged) {
        await tx.tenant.update({ where: { id: tenant.id }, data: { subscriptionStatus: 'PAST_DUE' } })
        await tx.activityLog.create({
          data: {
            tenantId: tenant.id,
            level: 'WARN',
            source: 'billing',
            eventType: 'subscription.payment_overdue',
            message: `Subscription ${subscription.name} could not be renewed because wallet funds are insufficient`,
            entityType: 'wallet',
            entityId: activeWallet.id,
            metadata: { subscriptionId: subscription.id, amountCents, balanceCents: activeWallet.balanceCents, currency: activeWallet.currency, dueAt: dueAt.toISOString() }
          }
        })
      }
      return {
        tenantId,
        state: 'insufficient_funds',
        amountCents,
        balanceCents: activeWallet.balanceCents,
        currency: activeWallet.currency,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        statusChanged
      }
    }

    const reference = `subscription:${tenant.id}:${subscription.id}:${dueAt.toISOString()}`
    const existingTransaction = await tx.walletTransaction.findUnique({ where: { reference } })
    if (existingTransaction) {
      return {
        tenantId,
        state: 'not_due',
        amountCents,
        balanceCents: existingTransaction.balanceAfterCents,
        currency: existingTransaction.currency,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        transactionId: existingTransaction.id
      }
    }

    const periodStart = now
    const periodEnd = addCalendarMonth(periodStart)
    const updatedWallet = await tx.wallet.update({ where: { id: activeWallet.id }, data: { balanceCents: { decrement: amountCents } } })
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: updatedWallet.id,
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        type: 'SUBSCRIPTION_CHARGE',
        amountCents: -amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        currency: updatedWallet.currency,
        description: `Subscription ${subscription.name} · ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
        reference,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd
      }
    })
    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionStartedAt: tenant.subscriptionStartedAt ?? periodStart,
        subscriptionPeriodStartAt: periodStart,
        subscriptionPeriodEndAt: periodEnd,
        subscriptionNextBillingAt: periodEnd
      }
    })
    await tx.activityLog.create({
      data: {
        tenantId: tenant.id,
        source: 'billing',
        eventType: 'subscription.charged',
        message: `Subscription ${subscription.name} was charged from wallet`,
        entityType: 'walletTransaction',
        entityId: transaction.id,
        metadata: { subscriptionId: subscription.id, transactionId: transaction.id, amountCents, balanceCents: updatedWallet.balanceCents, currency: updatedWallet.currency, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() }
      }
    })

    return {
      tenantId,
      state: 'charged',
      amountCents,
      balanceCents: updatedWallet.balanceCents,
      currency: updatedWallet.currency,
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      transactionId: transaction.id
    }
  })
}

export async function billDueTenantSubscriptions(now = new Date()) {
  const dueTenants = await prisma.tenant.findMany({
    where: {
      subscriptionNextBillingAt: { lte: now },
      subscription: { is: { isActive: true, monthlyPriceCents: { gt: 0 } } }
    },
    select: { id: true },
    orderBy: { subscriptionNextBillingAt: 'asc' },
    take: 250
  })

  return Promise.all(dueTenants.map((tenant) => billTenantSubscription(tenant.id, now)))
}
