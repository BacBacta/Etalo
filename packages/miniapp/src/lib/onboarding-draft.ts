import type { OnboardingForm } from "@/lib/onboarding-schema";

const KEY_PREFIX = "etalo.onboarding.draft.";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface OnboardingDraft {
  wallet: string;
  step: 1 | 2 | 3;
  data: Partial<OnboardingForm>;
  savedAt: string;
}

function keyFor(wallet: string) {
  return `${KEY_PREFIX}${wallet.toLowerCase()}`;
}

export function loadDraft(wallet: string): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (parsed.wallet.toLowerCase() !== wallet.toLowerCase()) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (age > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(
  wallet: string,
  step: 1 | 2 | 3,
  data: Partial<OnboardingForm>,
) {
  const draft: OnboardingDraft = {
    wallet: wallet.toLowerCase(),
    step,
    data,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(keyFor(wallet), JSON.stringify(draft));
  } catch {
    // Quota exceeded or private browsing — silently ignore, drafts are
    // best-effort and the user can still complete onboarding without
    // them.
  }
}

export function clearDraft(wallet: string) {
  try {
    localStorage.removeItem(keyFor(wallet));
  } catch {
    /* ignore */
  }
}
