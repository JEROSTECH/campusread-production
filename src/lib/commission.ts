/**
 * CampusRead Commission & Revenue Distribution Engine
 * 
 * STANDARD POLICY:
 * Total Revenue Split MUST ALWAYS EQUAL 100%.
 * 
 * 1. WITH AFFILIATE ATTRIBUTION:
 *    - Platform: 15%
 *    - Affiliate: 5%
 *    - Lecturer:  80%
 *    - Total: 15 + 5 + 80 = 100%
 * 
 * 2. WITHOUT AFFILIATE ATTRIBUTION (Direct Marketplace Sale):
 *    - Platform: 15%
 *    - Affiliate: 0%
 *    - Lecturer:  85% (Direct sale incentive)
 *    - Total: 15 + 0 + 85 = 100%
 */

export interface CommissionSplitResult {
  price: number;
  platformAmount: number;
  affiliateAmount: number;
  lecturerAmount: number;
  snapshot: {
    platformPercentage: number;
    affiliatePercentage: number;
    lecturerPercentage: number;
  };
}

export function calculateCommissionSplit(
  price: number,
  hasAffiliate: boolean = false,
  customConfig?: {
    platformPct?: number;
    affiliatePct?: number;
    lecturerPct?: number;
  }
): CommissionSplitResult {
  const cleanPrice = Math.max(0, Math.round(price));
  
  if (customConfig && customConfig.platformPct !== undefined) {
    const pPct = customConfig.platformPct ?? 15;
    const aPct = hasAffiliate ? (customConfig.affiliatePct ?? 5) : 0;
    const lPct = 100 - pPct - aPct;
    
    const pAmt = Math.round((cleanPrice * pPct) / 100);
    const aAmt = hasAffiliate ? Math.round((cleanPrice * aPct) / 100) : 0;
    const lAmt = cleanPrice - pAmt - aAmt;

    return {
      price: cleanPrice,
      platformAmount: pAmt,
      affiliateAmount: aAmt,
      lecturerAmount: lAmt,
      snapshot: {
        platformPercentage: pPct,
        affiliatePercentage: aPct,
        lecturerPercentage: lPct
      }
    };
  }

  // Standard Architecture
  if (hasAffiliate) {
    const platformAmount = Math.round(cleanPrice * 0.15);
    const affiliateAmount = Math.round(cleanPrice * 0.05);
    const lecturerAmount = cleanPrice - platformAmount - affiliateAmount; // Exactly 80%

    return {
      price: cleanPrice,
      platformAmount,
      affiliateAmount,
      lecturerAmount,
      snapshot: {
        platformPercentage: 15,
        affiliatePercentage: 5,
        lecturerPercentage: 80
      }
    };
  } else {
    const platformAmount = Math.round(cleanPrice * 0.15);
    const affiliateAmount = 0;
    const lecturerAmount = cleanPrice - platformAmount; // Exactly 85%

    return {
      price: cleanPrice,
      platformAmount,
      affiliateAmount,
      lecturerAmount,
      snapshot: {
        platformPercentage: 15,
        affiliatePercentage: 0,
        lecturerPercentage: 85
      }
    };
  }
}
