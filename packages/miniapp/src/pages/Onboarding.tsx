import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";
import { StepIndicator } from "@/components/shared/StepIndicator";
import { useMinipay } from "@/hooks/useMinipay";
import { apiFetch, ApiError } from "@/lib/api";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/lib/onboarding-draft";
import {
  DEFAULT_VALUES,
  OnboardingSchema,
  STEP_FIELDS,
  type OnboardingForm,
} from "@/lib/onboarding-schema";
import { StepDiscovery } from "@/pages/onboarding/StepDiscovery";
import { StepProduct } from "@/pages/onboarding/StepProduct";
import { StepShop } from "@/pages/onboarding/StepShop";

type Step = 1 | 2 | 3;

function parseStep(raw: string | null): Step {
  if (raw === "2") return 2;
  if (raw === "3") return 3;
  return 1;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { address } = useMinipay();

  const step = parseStep(params.get("step"));

  const form = useForm<OnboardingForm>({
    resolver: zodResolver(OnboardingSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  // Hydrate from localStorage draft once we know the wallet.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || !address) return;
    const draft = loadDraft(address);
    if (draft) {
      form.reset({ ...DEFAULT_VALUES, ...draft.data });
      if (draft.step !== step) {
        setParams({ step: String(draft.step) }, { replace: true });
      }
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, hydrated]);

  const goTo = (next: Step) => setParams({ step: String(next) });

  const handleNext = async () => {
    if (step === 1) return goTo(2);
    const ok = await form.trigger([...STEP_FIELDS[step]]);
    if (!ok) return;
    if (address) saveDraft(address, step, form.getValues());
    if (step === 2) goTo(3);
    else submit.mutate();
  };

  const handleBack = () => {
    if (step === 1) navigate("/");
    else goTo((step - 1) as Step);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const v = form.getValues();
      return apiFetch<{ profile: { shop_handle: string } }>(
        "/onboarding/complete",
        {
          method: "POST",
          wallet: address!,
          body: JSON.stringify({
            profile: {
              shop_handle: v.shop_handle,
              shop_name: v.shop_name,
              country: v.country,
              language: v.language,
              logo_ipfs_hash: v.logo_ipfs_hash,
            },
            first_product: {
              title: v.product_title,
              description: v.product_description || null,
              price_usdt: v.product_price_usdt,
              stock: v.product_stock,
              photo_ipfs_hashes: v.product_photos,
            },
          }),
        },
      );
    },
    onSuccess: () => {
      if (address) clearDraft(address);
      queryClient.invalidateQueries({ queryKey: ["sellers", "me"] });
      navigate("/seller");
    },
  });

  const ctaLabel = useMemo(() => {
    if (submit.isPending) return "Saving…"; // visible processing, not a connection state
    if (step === 3) return "Create my shop";
    return "Continue";
  }, [step, submit.isPending]);

  const submitError =
    submit.error instanceof ApiError
      ? ((submit.error.body as { detail?: string } | null)?.detail ??
        "Something went wrong. Try again.")
      : null;

  return (
    <MobileLayout
      header={
        <div className="flex w-full items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={submit.isPending}
          >
            Back
          </Button>
          <StepIndicator current={step} />
          <span className="w-14" aria-hidden />
        </div>
      }
      bottomCta={
        <div className="flex flex-col gap-2">
          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}
          <Button
            className="w-full"
            size="lg"
            onClick={handleNext}
            disabled={submit.isPending}
          >
            {ctaLabel}
          </Button>
        </div>
      }
    >
      <FormProvider {...form}>
        {step === 1 ? (
          <StepDiscovery onNext={() => goTo(2)} />
        ) : step === 2 ? (
          <StepShop />
        ) : (
          <StepProduct />
        )}
      </FormProvider>
    </MobileLayout>
  );
}
