export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  badge?: string;
}

export interface PremiumPlan {
  id: string;
  name: string;
  duration: string;
  durationDays: number;
  price: number;
  currency: string;
  features: string[];
  badge?: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  createPaymentLink(userId: number, itemId: string, amount: number, currency: string): Promise<string>;
  verifyPayment(reference: string): Promise<{ success: boolean; userId?: number; itemId?: string }>;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_50",   name: "Starter Pack",  credits: 50,   price: 0.99,  currency: "USD", badge: "🌱" },
  { id: "pack_150",  name: "Basic Pack",    credits: 150,  price: 2.49,  currency: "USD", badge: "⚡" },
  { id: "pack_500",  name: "Pro Pack",      credits: 500,  price: 6.99,  currency: "USD", badge: "🚀", },
  { id: "pack_1500", name: "Power Pack",    credits: 1500, price: 17.99, currency: "USD", badge: "💎" },
];

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: "vip_monthly",
    name: "VIP Monthly",
    duration: "30d",
    durationDays: 30,
    price: 9.99,
    currency: "USD",
    badge: "⭐",
    features: [
      "Unlimited messages",
      "Unlimited images",
      "20 builds/day",
      "All special modes unlocked",
      "Priority AI responses",
      "No credit deductions",
    ],
  },
  {
    id: "vip_lifetime",
    name: "VIP Lifetime",
    duration: "lifetime",
    durationDays: -1,
    price: 49.99,
    currency: "USD",
    badge: "👑",
    features: [
      "Everything in VIP Monthly",
      "Lifetime access — never expires",
      "Early access to new features",
    ],
  },
];

// ── Payment provider registry ──────────────────────────────────────────────────
// Plug in Paystack / Stripe / crypto providers here when ready.
// No provider is active by default — structure only.

const _registeredProviders = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  _registeredProviders.set(provider.id, provider);
}

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return _registeredProviders.get(id);
}

export function listPaymentProviders(): PaymentProvider[] {
  return Array.from(_registeredProviders.values());
}

export function hasAnyPaymentProvider(): boolean {
  return _registeredProviders.size > 0;
}

export async function initiatePayment(
  userId: number,
  packId: string
): Promise<{ url: string | null; provider: string | null }> {
  const providers = listPaymentProviders();
  if (providers.length === 0) return { url: null, provider: null };

  const pack = CREDIT_PACKS.find((p) => p.id === packId) || PREMIUM_PLANS.find((p) => p.id === packId);
  if (!pack) return { url: null, provider: null };

  const provider = providers[0];
  const url = await provider.createPaymentLink(userId, packId, pack.price, pack.currency);
  return { url, provider: provider.name };
}
