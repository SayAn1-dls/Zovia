"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MapPin, Save, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FieldError, FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/features/locations/components/location-picker";
import { apiFetch, isApiError } from "@/lib/api/client";

import { updateLocationAction } from "../actions";
import { locationSchema, type CityOption, type LatLng, type LocationFormValues, type LocationInput, type OwnerPropertyDetail } from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["address_line", "locality", "city", "state", "pincode", "landmark", "lat"] as const;

/** Reads a coordinate pair out of whatever shape the geocode endpoint returns. */
function firstPoint(data: unknown): LatLng | null {
  const candidates: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? [data, ...(Array.isArray((data as { results?: unknown }).results) ? ((data as { results: unknown[] }).results) : [])]
      : [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const { lat, lng, lon } = item as { lat?: unknown; lng?: unknown; lon?: unknown };
    const longitude = typeof lng === "number" ? lng : typeof lon === "number" ? lon : null;
    if (typeof lat === "number" && longitude !== null) return { lat, lng: longitude };
  }
  return null;
}

export function LocationForm({ property, cities }: { property: OwnerPropertyDetail; cities: CityOption[] }) {
  const router = useRouter();
  const form = useForm<LocationFormValues, unknown, LocationInput>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      property_id: property.id,
      address_line: property.address_line ?? "",
      locality: property.locality ?? "",
      city: property.city ?? "",
      state: property.state ?? "",
      pincode: property.pincode ?? "",
      landmark: property.landmark ?? "",
      lat: property.location?.lat ?? null,
      lng: property.location?.lng ?? null,
    },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const { isSubmitting, isDirty, errors } = form.formState;
  const [lat, lng, cityName] = useWatch({ control: form.control, name: ["lat", "lng", "city"] });
  const pin = lat !== null && lng !== null && lat !== undefined && lng !== undefined ? { lat, lng } : null;
  const city = cities.find((option) => option.name === cityName) ?? null;

  function setPin(point: LatLng) {
    form.setValue("lat", point.lat, { shouldDirty: true, shouldValidate: true });
    form.setValue("lng", point.lng, { shouldDirty: true, shouldValidate: true });
  }

  async function findOnMap() {
    const values = form.getValues();
    // Most specific first; a full street address often has no match, the locality usually does.
    const queries = [
      [values.address_line, values.locality, values.city, values.pincode],
      [values.landmark, values.locality, values.city],
      [values.locality, values.city],
    ]
      .map((parts) => parts.filter(Boolean).join(", "))
      .filter((query, index, all) => query.trim().length >= 3 && all.indexOf(query) === index);
    if (queries.length === 0) {
      toast.error("Enter the address first.");
      return;
    }
    setFinding(true);
    try {
      for (const query of queries) {
        const point = firstPoint(await apiFetch<unknown>("/locations/geocode", { query: { q: query } }));
        if (point) {
          setPin(point);
          toast.success("Pin placed near the address. Drag it to the exact building.");
          return;
        }
      }
      toast.error("We could not find that address. Tap the map to place the pin.");
    } catch (error) {
      toast.error(
        isApiError(error) && (error.status === 404 || error.code === "unavailable")
          ? "Address search is not available right now. Tap the map to place the pin."
          : "We could not find that address. Tap the map to place the pin.",
      );
    } finally {
      setFinding(false);
    }
  }

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    const result = await updateLocationAction(values);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    form.reset(values);
    toast.success("Address saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
      <FormField control={form.control} name="address_line" label="Street address" description="Building and street. It is shown on the published listing.">
        {(field) => <Input autoComplete="address-line1" maxLength={200} {...field} />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="locality" label="Locality / area">
          {(field) => <Input autoComplete="address-level3" maxLength={80} {...field} />}
        </FormField>
        <FormField control={form.control} name="city" label="City">
          {(field) => (
            <NativeSelect
              {...field}
              onChange={(event) => {
                field.onChange(event);
                const chosen = cities.find((option) => option.name === event.target.value);
                if (chosen && !form.getValues("state")) form.setValue("state", chosen.state, { shouldDirty: true });
              }}
            >
              <option value="">Choose a city</option>
              {cities.map((option) => (
                <option key={option.slug} value={option.name}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="state" label="State" optional>
          {(field) => <Input autoComplete="address-level1" maxLength={60} {...field} />}
        </FormField>
        <FormField control={form.control} name="pincode" label="PIN code" optional>
          {(field) => <Input inputMode="numeric" autoComplete="postal-code" maxLength={6} {...field} />}
        </FormField>
      </div>
      <FormField control={form.control} name="landmark" label="Landmark" optional>
        {(field) => <Input maxLength={120} placeholder="Near the metro station" {...field} />}
      </FormField>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Map pin</p>
            <p className="text-sm text-muted-foreground">Tap the map or drag the pin to the building. Required before review.</p>
          </div>
          <Button type="button" variant="outline" size="lg" onClick={findOnMap} disabled={finding}>
            {finding ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Search data-icon="inline-start" aria-hidden />}
            Find address on map
          </Button>
        </div>
        <LocationPicker key={city?.slug ?? "india"} value={pin} onChange={setPin} fallbackCenter={city?.center ?? undefined} className="h-80" />
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="pin-status">
          <MapPin className="size-4" aria-hidden />
          {pin ? `Pinned at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "No pin yet"}
        </p>
        {errors.lat?.message ? <FieldError>{errors.lat.message}</FieldError> : null}
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
        Save address
      </Button>
    </form>
  );
}
