// Centralized feature flags. Flip these to re-enable hidden features.
//
// PRICING_ENABLED — controls the subscription/CPM pricing system.
// When false:
//   - SubscriptionContext returns tier='paid' for everyone (paywalls don't trigger)
//   - The pricing-focused Onboarding flow is skipped
//   - Any UI mention of upgrade/billing/tier should be wrapped in {PRICING_ENABLED && (...)}
// When true:
//   - Full pricing flow returns (CPM tier setup, paywalls, etc.)

export const PRICING_ENABLED = false;
