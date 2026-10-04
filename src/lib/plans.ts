export const TRIAL_DAYS = 14

export const UNLIMITED = -1

export const formatLimit = (value: number) => (value === UNLIMITED ? 'Unlimited' : value.toLocaleString('en-PH'))

// Always lands on the end of the 14th day, regardless of what time signup
// happened — so a tenant keeps their trial for the whole last calendar day
// instead of cutting off mid-day at the signup timestamp.
export const trialEndDate = (from: Date = new Date()) => {
  const end = new Date(from)
  end.setDate(end.getDate() + TRIAL_DAYS)
  end.setHours(23, 59, 59, 999)
  return end
}

export const daysUntil = (target: Date | string) =>
  Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
