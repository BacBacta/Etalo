import { Check, Loader2, X } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { IpfsLogoUpload } from "@/components/shared/IpfsImageUpload";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import {
  COUNTRIES,
  LANGUAGES,
  type OnboardingForm,
} from "@/lib/onboarding-schema";

export function StepShop() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<OnboardingForm>();

  const handle = watch("shop_handle");
  const logoHash = watch("logo_ipfs_hash");
  const avail = useHandleAvailability(handle);

  return (
    <div className="flex flex-col gap-5 py-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Create your shop</h2>
        <p className="text-base text-muted-foreground">
          Tell buyers who you are.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shop_handle">Handle</Label>
        <div className="relative">
          <Input
            id="shop_handle"
            placeholder="abena_fashion"
            autoCapitalize="none"
            autoCorrect="off"
            {...register("shop_handle", {
              setValueAs: (v: string) => v.toLowerCase().replace(/^@/, ""),
            })}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {avail.status === "checking" || avail.status === "debouncing" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : avail.status === "available" ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : avail.status === "unavailable" ? (
              <X className="h-4 w-4 text-destructive" />
            ) : null}
          </span>
        </div>
        {errors.shop_handle ? (
          <p className="text-sm text-destructive">
            {errors.shop_handle.message}
          </p>
        ) : avail.status === "unavailable" && avail.reason === "taken" ? (
          <p className="text-sm text-destructive">Handle already taken.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shop_name">Shop name</Label>
        <Input
          id="shop_name"
          placeholder="Abena Fashion"
          {...register("shop_name")}
        />
        {errors.shop_name ? (
          <p className="text-sm text-destructive">{errors.shop_name.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          placeholder="Handmade Ankara pieces for every body."
          maxLength={500}
          {...register("product_description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">Country</Label>
          <NativeSelect id="country" {...register("country")}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c === "NG"
                  ? "Nigeria"
                  : c === "GH"
                    ? "Ghana"
                    : c === "KE"
                      ? "Kenya"
                      : "Other"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="language">Language</Label>
          <NativeSelect id="language" {...register("language")}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l === "en" ? "English" : l === "fr" ? "Français" : "Swahili"}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Logo</Label>
        <IpfsLogoUpload
          value={logoHash ?? ""}
          onChange={(hash) =>
            setValue("logo_ipfs_hash", hash, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        {errors.logo_ipfs_hash ? (
          <p className="text-sm text-destructive">
            {errors.logo_ipfs_hash.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
