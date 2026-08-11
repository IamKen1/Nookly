export const TRIAL_DAYS = 14

export const UNLIMITED = -1

export const formatLimit = (value: number) => (value === UNLIMITED ? 'Unlimited' : value.toLocaleString('en-PH'))

export const trialEndDate = (from: Date = new Date()) => {
  const end = new Date(from)
  end.setDate(end.getDate() + TRIAL_DAYS)
  return end
}

export const daysUntil = (target: Date | string) =>
  Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
