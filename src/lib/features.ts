export type SubscriptionTier = 'free' | 'pro';

export const PLAN_LIMITS = {
  free: {
    trips: 3,
    membersPerTrip: 10,
    attachmentsPerTrip: 20,
  },
  pro: {
    trips: Infinity,
    membersPerTrip: Infinity,
    attachmentsPerTrip: Infinity,
  },
} as const;

export function canUseFeature(
  tier: SubscriptionTier,
  feature: keyof typeof PLAN_LIMITS['free']
): boolean {
  return PLAN_LIMITS[tier]?.[feature] === Infinity ||
    PLAN_LIMITS[tier]?.[feature] > 0;
}

export function isWithinLimit(
  tier: SubscriptionTier,
  feature: keyof typeof PLAN_LIMITS['free'],
  currentCount: number
): boolean {
  const limit = PLAN_LIMITS[tier]?.[feature];
  return limit === Infinity || currentCount < limit;
}
