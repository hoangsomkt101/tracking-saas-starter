import type { DashboardContext } from '../types/domain'

export async function runEntityAction(ctx: DashboardContext, action: () => Promise<void>, successMessage: string) {
  try {
    await action()
    ctx.setStatus({ type: 'success', message: successMessage })
    await ctx.loadData()
  } catch (error) {
    ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Thao tác thất bại' })
  }
}
