import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IpfsPhotosUpload } from "@/components/shared/IpfsImageUpload";
import { STABLECOIN_LABEL } from "@/lib/terminology";
import type { OnboardingForm } from "@/lib/onboarding-schema";

export function StepProduct() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<OnboardingForm>();

  const photos = watch("product_photos");

  return (
    <div className="flex flex-col gap-5 py-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Your first product</h2>
        <p className="text-base text-muted-foreground">
          You can add more later.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor="product_title">Title</Label>
        <Input
          id="product_title"
          placeholder="Ankara maxi dress"
          {...register("product_title")}
        />
        {errors.product_title ? (
          <p className="text-sm text-destructive">
            {errors.product_title.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="product_description">Description (optional)</Label>
        <Textarea
          id="product_description"
          maxLength={500}
          placeholder="Sizes S to XL, delivery within 5 days."
          {...register("product_description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="product_price_usdt">Price (USDT)</Label>
          <Input
            id="product_price_usdt"
            inputMode="decimal"
            placeholder="12.50"
            {...register("product_price_usdt")}
          />
          <p className="text-sm text-muted-foreground">
            Paid in {STABLECOIN_LABEL.toLowerCase()}.
          </p>
          {errors.product_price_usdt ? (
            <p className="text-sm text-destructive">
              {errors.product_price_usdt.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="product_stock">Stock</Label>
          <Input
            id="product_stock"
            inputMode="numeric"
            type="number"
            min={1}
            {...register("product_stock", { valueAsNumber: true })}
          />
          {errors.product_stock ? (
            <p className="text-sm text-destructive">
              {errors.product_stock.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Photos (1 to 5)</Label>
        <IpfsPhotosUpload
          value={photos ?? []}
          onChange={(hashes) =>
            setValue("product_photos", hashes, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        {errors.product_photos ? (
          <p className="text-sm text-destructive">
            {errors.product_photos.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
