type PackageDefaults = {
  shortFormYoutube: number;
  shortFormTiktok: number;
  shortFormInstagram: number;
  longFormPosts: number;
  longFormFactor: 'mention' | 'adSpot' | 'dedicated';
  paidUsage: boolean;
  paidUsageDuration: number;
  whitelisting: boolean;
  whitelistingDuration: number;
  exclusivity: boolean;
  exclusivityCategory: string;
  exclusivityMonths: number;
  rushLevel: 'None' | 'Standard' | 'Extreme';
};

export const packageDefaults: Record<string, PackageDefaults> = {
  Starter: {
    shortFormYoutube: 1,
    shortFormTiktok: 1,
    shortFormInstagram: 1,
    longFormPosts: 0,
    longFormFactor: 'mention',
    paidUsage: false,
    paidUsageDuration: 0,
    whitelisting: false,
    whitelistingDuration: 0,
    exclusivity: false,
    exclusivityCategory: '',
    exclusivityMonths: 0,
    rushLevel: 'None',
  },
  Core: {
    shortFormYoutube: 1,
    shortFormTiktok: 2,
    shortFormInstagram: 1,
    longFormPosts: 1,
    longFormFactor: 'mention',
    paidUsage: false,
    paidUsageDuration: 0,
    whitelisting: false,
    whitelistingDuration: 0,
    exclusivity: false,
    exclusivityCategory: '',
    exclusivityMonths: 0,
    rushLevel: 'None',
  },
  Premium: {
    shortFormYoutube: 2,
    shortFormTiktok: 3,
    shortFormInstagram: 2,
    longFormPosts: 1,
    longFormFactor: 'adSpot',
    paidUsage: true,
    paidUsageDuration: 30,
    whitelisting: false,
    whitelistingDuration: 0,
    exclusivity: false,
    exclusivityCategory: '',
    exclusivityMonths: 0,
    rushLevel: 'None',
  },
  Platinum: {
    shortFormYoutube: 3,
    shortFormTiktok: 4,
    shortFormInstagram: 3,
    longFormPosts: 2,
    longFormFactor: 'dedicated',
    paidUsage: true,
    paidUsageDuration: 60,
    whitelisting: true,
    whitelistingDuration: 30,
    exclusivity: false,
    exclusivityCategory: '',
    exclusivityMonths: 0,
    rushLevel: 'None',
  },
};
