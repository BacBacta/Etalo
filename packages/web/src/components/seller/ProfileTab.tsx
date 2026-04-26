"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type SellerProfilePublic,
  type SellerProfileUpdate,
  updateSellerProfile,
} from "@/lib/seller-api";

interface Props {
  profile: SellerProfilePublic;
  address: string;
  onUpdated: (p: SellerProfilePublic) => void;
}

export function ProfileTab({ profile, address, onUpdated }: Props) {
  const [shopName, setShopName] = useState(profile.shop_name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    shopName !== profile.shop_name ||
    (description ?? "") !== (profile.description ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload: SellerProfileUpdate = {
        shop_name: shopName,
        description: description || null,
      };
      const updated = await updateSellerProfile(address, payload);
      onUpdated(updated);
      toast.success("Profile updated");
    } catch {
      toast.error("Update failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="shop-name"
          className="mb-1 block text-base font-medium"
        >
          Shop name
        </label>
        <input
          id="shop-name"
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="min-h-[44px] w-full rounded-md border border-neutral-300 p-2 text-base"
        />
      </div>
      <div>
        <label
          htmlFor="shop-description"
          className="mb-1 block text-base font-medium"
        >
          Description
        </label>
        <textarea
          id="shop-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-neutral-300 p-2 text-base"
        />
      </div>
      <p className="text-sm text-neutral-600">
        Shop handle (@{profile.shop_handle}) and country are not editable
        in V1. Logo upload coming in Étape 8.3.
      </p>
      <Button
        type="submit"
        disabled={!dirty || saving}
        className="min-h-[44px]"
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
