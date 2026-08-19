export class BestOfferProvider {
  async findBestOffer(_customerState) { throw new Error('BestOfferProvider.findBestOffer must be implemented'); }
}

export class MockBestOfferProvider extends BestOfferProvider {
  constructor(offers = {}) { super(); this.offers = offers; }
  async findBestOffer(state) {
    return this.offers[state.currentPlan] || { planId: 'Assisted Essentials', annualSaving: 216, paymentMethods: ['BPAY', 'CARD', 'DIRECT_DEBIT'] };
  }
}

export function pricingProvider() {
  const kind = (process.env.PRICING_PROVIDER || 'mock').toLowerCase();
  if (kind === 'mock') return new MockBestOfferProvider();
  throw new Error(`Pricing provider ${kind} is not configured`);
}
