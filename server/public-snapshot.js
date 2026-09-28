export function publicSnapshot(cache) {
  return {
    meta: cache.meta,
    products: (cache.products ?? []).map((product) => ({
      id: product.id,
      exchange: product.exchange,
      asset: product.asset,
      productType: product.productType,
      typeTags: product.typeTags,
      eligibilityTags: product.eligibilityTags,
      duration: product.duration,
      durationDays: product.durationDays,
      apy: product.apy,
      apyMin: product.apyMin,
      apyMax: product.apyMax,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      highApyCapacity: product.highApyCapacity,
      tierDetails: product.tierDetails,
      eligibility: product.eligibility,
      restricted: product.restricted,
      note: product.note,
      sourceUrl: product.sourceUrl,
      announcementUrl: product.announcementUrl,
    })),
  };
}
