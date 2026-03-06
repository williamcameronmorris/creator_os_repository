import { Profile } from './supabase';

export const CPM_TIERS = {
  conservative: 10,
  standard: 20,
  premium: 30,
  specialized: 40,
};

export const OBJECTIVE_MULTIPLIERS = {
  Awareness: { default: 1.0, low: 1.0, high: 1.1 },
  Repurposing: { default: 1.15, low: 1.1, high: 1.3 },
  Conversion: { default: 1.1, low: 1.05, high: 1.25 },
};

export const LONG_FORM_FACTORS = {
  mention: 1.0,
  adSpot: 1.15,
  dedicated: 1.75,
};

export const PAID_USAGE_RATES = {
  30: { low: 0.1, high: 0.2 },
  60: { low: 0.2, high: 0.35 },
  180: { low: 0.45, high: 0.75 },
};

export const WHITELISTING_RATES = {
  30: { low: 0.15, high: 0.25 },
  60: { low: 0.25, high: 0.4 },
  180: { low: 0.5, high: 0.9 },
};

export const EXCLUSIVITY_RATES = {
  loose: { low: 0.1, high: 0.15 },
  tight: { low: 0.15, high: 0.25 },
};

export const RUSH_RATES = {
  Standard: { low: 0.25, high: 0.5 },
  Extreme: { low: 0.75, high: 1.5 },
};

export type PricingInput = {
  profile: Profile;
  shortFormPosts: {
    youtube: number;
    tiktok: number;
    instagram: number;
  };
  longFormPosts: number;
  longFormFactor: keyof typeof LONG_FORM_FACTORS;
  objective: keyof typeof OBJECTIVE_MULTIPLIERS;
  paidUsageDays?: number;
  whitelistingDays?: number;
  exclusivityType?: 'loose' | 'tight';
  exclusivityMonths?: number;
  rushLevel?: 'None' | 'Standard' | 'Extreme';
};

export type PricingOutput = {
  low: number;
  standard: number;
  stretch: number;
  breakdown: {
    expectedViews: number;
    baseFee: {
      low: number;
      standard: number;
      stretch: number;
    };
    addOns: {
      paidUsage: { low: number; high: number };
      whitelisting: { low: number; high: number };
      exclusivity: { low: number; high: number };
      rush: { low: number; high: number };
    };
  };
};

export function calculateRate(
  followerCount: number,
  deliverableType: string,
  platform: string,
  options?: {
    urgency?: string;
    exclusivity?: boolean;
    usageRights?: string;
  }
): number {
  const baseRate = (followerCount / 1000) * 20;

  let multiplier = 1.0;

  if (deliverableType.includes('Reel') || deliverableType.includes('Video')) {
    multiplier *= 1.5;
  }
  if (deliverableType.includes('Story')) {
    multiplier *= 0.5;
  }
  if (deliverableType.includes('YouTube')) {
    multiplier *= 2.0;
  }

  if (options?.urgency === 'rush') {
    multiplier *= 1.25;
  }
  if (options?.exclusivity) {
    multiplier *= 1.3;
  }
  if (options?.usageRights === 'paid') {
    multiplier *= 1.5;
  }

  return Math.round(baseRate * multiplier);
}

export function calculatePricing(input: PricingInput): PricingOutput {
  const { profile, shortFormPosts, longFormPosts, longFormFactor, objective, paidUsageDays, whitelistingDays, exclusivityType, exclusivityMonths, rushLevel } = input;

  const expectedShortViews =
    shortFormPosts.youtube * profile.youtube_shorts_avg_views +
    shortFormPosts.tiktok * profile.tiktok_avg_views +
    shortFormPosts.instagram * profile.instagram_avg_views;

  const expectedLongViews = (profile.include_youtube_longform ?? true)
    ? longFormPosts * profile.youtube_avg_views * LONG_FORM_FACTORS[longFormFactor]
    : 0;

  const totalExpectedViews = expectedShortViews + expectedLongViews;

  const getCPM = (tier: 'conservative' | 'standard' | 'premium') => {
    if (profile.cpm_tier === 'custom' && profile.cpm_custom) {
      return profile.cpm_custom;
    }
    return CPM_TIERS[tier];
  };

  const objectiveMultiplier = OBJECTIVE_MULTIPLIERS[objective];

  const baseFeeLow = (totalExpectedViews / 1000) * getCPM('conservative') * objectiveMultiplier.low;
  const baseFeeStandard = (totalExpectedViews / 1000) * getCPM('standard') * objectiveMultiplier.default;
  const baseFeeStretch = (totalExpectedViews / 1000) * getCPM('premium') * objectiveMultiplier.high;

  const addOns = {
    paidUsage: { low: 0, high: 0 },
    whitelisting: { low: 0, high: 0 },
    exclusivity: { low: 0, high: 0 },
    rush: { low: 0, high: 0 },
  };

  if (paidUsageDays && paidUsageDays > 0) {
    const closestDuration = [30, 60, 180].reduce((prev, curr) =>
      Math.abs(curr - paidUsageDays) < Math.abs(prev - paidUsageDays) ? curr : prev
    ) as keyof typeof PAID_USAGE_RATES;
    const rate = PAID_USAGE_RATES[closestDuration];
    addOns.paidUsage.low = baseFeeLow * rate.low;
    addOns.paidUsage.high = baseFeeStretch * rate.high;
  }

  if (whitelistingDays && whitelistingDays > 0) {
    const closestDuration = [30, 60, 180].reduce((prev, curr) =>
      Math.abs(curr - whitelistingDays) < Math.abs(prev - whitelistingDays) ? curr : prev
    ) as keyof typeof WHITELISTING_RATES;
    const rate = WHITELISTING_RATES[closestDuration];
    addOns.whitelisting.low = baseFeeLow * rate.low;
    addOns.whitelisting.high = baseFeeStretch * rate.high;
  }

  if (exclusivityType && exclusivityMonths && exclusivityMonths > 0) {
    const rate = EXCLUSIVITY_RATES[exclusivityType];
    addOns.exclusivity.low = baseFeeLow * rate.low * exclusivityMonths;
    addOns.exclusivity.high = baseFeeStretch * rate.high * exclusivityMonths;
  }

  if (rushLevel && rushLevel !== 'None') {
    const rate = RUSH_RATES[rushLevel];
    addOns.rush.low = baseFeeLow * rate.low;
    addOns.rush.high = baseFeeStretch * rate.high;
  }

  const totalLow = baseFeeLow + addOns.paidUsage.low + addOns.whitelisting.low + addOns.exclusivity.low + addOns.rush.low;
  const totalStandard = baseFeeStandard + (addOns.paidUsage.low + addOns.paidUsage.high) / 2 + (addOns.whitelisting.low + addOns.whitelisting.high) / 2 + (addOns.exclusivity.low + addOns.exclusivity.high) / 2 + (addOns.rush.low + addOns.rush.high) / 2;
  const totalStretch = baseFeeStretch + addOns.paidUsage.high + addOns.whitelisting.high + addOns.exclusivity.high + addOns.rush.high;

  return {
    low: Math.round(totalLow),
    standard: Math.round(totalStandard),
    stretch: Math.round(totalStretch),
    breakdown: {
      expectedViews: Math.round(totalExpectedViews),
      baseFee: {
        low: Math.round(baseFeeLow),
        standard: Math.round(baseFeeStandard),
        stretch: Math.round(baseFeeStretch),
      },
      addOns,
    },
  };
}
