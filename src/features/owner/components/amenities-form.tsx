"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setAmenitiesAction } from "../actions";
import type { AmenityOption } from "../schemas";
import { TogglePill } from "./bits";

const CATEGORY_LABELS: Record<string, string> = {
  essentials: "Essentials",
  comfort: "Comfort",
  room: "In the room",
  services: "Services",
  safety: "Safety",
  common: "Common areas",
};

export function AmenitiesForm({ propertyId, amenities, selected }: { propertyId: string; amenities: AmenityOption[]; selected: string[] }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();
  const dirty = [...codes].sort().join(",") !== [...selected].sort().join(",");

  const categories = [...new Set(amenities.map((amenity) => amenity.category))];

  function toggle(code: string) {
    setCodes((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  function save() {
    startTransition(async () => {
      const result = await setAmenitiesAction({ property_id: propertyId, amenity_codes: codes });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Amenities saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <fieldset key={category}>
          <legend className="mb-3 text-sm font-semibold text-foreground">{CATEGORY_LABELS[category] ?? category}</legend>
          <div className="flex flex-wrap gap-2">
            {amenities
              .filter((amenity) => amenity.category === category)
              .map((amenity) => (
                <TogglePill key={amenity.code} label={amenity.name} pressed={codes.includes(amenity.code)} onToggle={() => toggle(amenity.code)} />
              ))}
          </div>
        </fieldset>
      ))}
      <Button size="lg" onClick={save} disabled={!dirty || pending}>
        {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
        Save amenities
      </Button>
    </div>
  );
}
