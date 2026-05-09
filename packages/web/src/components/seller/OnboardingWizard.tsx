/**
 * OnboardingWizard — self-service seller onboarding.
 *
 * Renders inside the seller dashboard when /sellers/me returns null
 * (no profile yet). Two-step flow :
 *   1. Boutique identity (handle, name, country, optional logo)
 *   2. First product (title, price, stock, photos)
 *
 * Both steps are kept in local state ; the final POST to
 * /api/v1/onboarding/complete only fires once the user clicks
 * "Create my boutique" on step 2. On 409 (handle taken) we bounce
 * back to step 1 with the conflict surfaced inline ; other errors
 * surface as a toast and stay on step 2.
 *
 * onSuccess receives the fresh SellerProfilePublic so the dashboard
 * parent can swap straight into the live shop view without an extra
 * round-trip.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  OnboardingStepBoutique,
  type BoutiqueValues,
} from "@/components/seller/OnboardingStepBoutique";
import {
  OnboardingStepProduct,
  type ProductValues,
} from "@/components/seller/OnboardingStepProduct";
import {
  completeOnboarding,
  HandleTakenError,
  type OnboardingCompleteResponse,
} from "@/lib/onboarding-api";

interface Props {
  walletAddress: string;
  onSuccess: (response: OnboardingCompleteResponse) => void;
}

type Step = "boutique" | "product";

export function OnboardingWizard({ walletAddress, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("boutique");
  const [boutique, setBoutique] = useState<BoutiqueValues | null>(null);
  const [product, setProduct] = useState<ProductValues | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [boutiqueConflict, setBoutiqueConflict] = useState(false);

  const handleBoutiqueNext = (values: BoutiqueValues) => {
    setBoutique(values);
    setBoutiqueConflict(false);
    setStep("product");
  };

  const handleProductBack = () => {
    setStep("boutique");
  };

  const handleProductSubmit = async (productValues: ProductValues) => {
    if (!boutique) {
      // Defensive — UI prevents this path, but guard anyway so a
      // refreshed wizard doesn't POST a partial payload.
      setStep("boutique");
      return;
    }
    setProduct(productValues);
    setIsSubmitting(true);
    try {
      const response = await completeOnboarding(walletAddress, {
        profile: {
          shop_handle: boutique.shop_handle,
          shop_name: boutique.shop_name,
          country: boutique.country,
          language: "en",
          logo_ipfs_hash: boutique.logo_ipfs_hash,
          description:
            boutique.description.length > 0 ? boutique.description : null,
        },
        first_product: {
          title: productValues.title,
          description:
            productValues.description.length > 0
              ? productValues.description
              : null,
          price_usdt: productValues.price_usdt,
          stock: productValues.stock,
          photo_ipfs_hashes: productValues.photo_ipfs_hashes,
        },
      });
      toast.success("Boutique created!");
      onSuccess(response);
    } catch (err) {
      if (err instanceof HandleTakenError) {
        toast.error(
          "Shop handle was taken while you filled out the form. Pick another.",
        );
        setBoutiqueConflict(true);
        setStep("boutique");
      } else {
        toast.error("Couldn't create your boutique. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md py-8">
      <header className="mb-6 text-center">
        <h2 className="mb-1 text-xl font-semibold">Create your boutique</h2>
        <p className="text-sm text-neutral-600">
          Step {step === "boutique" ? 1 : 2} of 2 ·{" "}
          {step === "boutique" ? "Your shop" : "Your first product"}
        </p>
      </header>

      {boutiqueConflict ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="onboarding-handle-conflict"
        >
          Shop handle was taken. Please pick another.
        </div>
      ) : null}

      {step === "boutique" ? (
        <OnboardingStepBoutique
          walletAddress={walletAddress}
          initial={boutique ?? undefined}
          onNext={handleBoutiqueNext}
        />
      ) : (
        <OnboardingStepProduct
          walletAddress={walletAddress}
          initial={product ?? undefined}
          isSubmitting={isSubmitting}
          onBack={handleProductBack}
          onSubmit={handleProductSubmit}
        />
      )}
    </div>
  );
}
