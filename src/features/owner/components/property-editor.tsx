"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";

import type { AmenityOption, CityOption, EditorTab, OwnerPropertyDetail } from "../schemas";
import { AmenitiesForm } from "./amenities-form";
import { AvailabilityForm } from "./availability-form";
import { BasicsForm } from "./basics-form";
import { Panel } from "./bits";
import { ListingActions } from "./listing-actions";
import { LocationForm } from "./location-form";
import { PhotosEditor } from "./photos-editor";
import { PricingForm } from "./pricing-form";
import { RoomsEditor } from "./rooms-editor";
import { RulesAndChargesForm } from "./rules-form";

const TAB_LABELS: Record<EditorTab, string> = {
  basics: "Basics",
  location: "Address & map",
  pricing: "Pricing",
  rooms: "Rooms & beds",
  availability: "Availability",
  amenities: "Amenities",
  rules: "Rules & charges",
  photos: "Photos",
};

/** Tabbed, mobile-first listing editor. Every tab saves on its own; nothing is lost between tabs. */
export function PropertyEditor({
  property,
  cities,
  amenities,
  initialTab,
}: {
  property: OwnerPropertyDetail;
  cities: CityOption[];
  amenities: AmenityOption[];
  initialTab: EditorTab;
}) {
  const tabs: EditorTab[] = [
    "basics",
    "location",
    "pricing",
    ...(property.listing_mode === "per_bed" ? (["rooms"] as const) : []),
    "availability",
    "amenities",
    "rules",
    "photos",
  ];
  const [tab, setTab] = useState<EditorTab>(tabs.includes(initialTab) ? initialTab : "basics");

  function open(next: EditorTab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={property.status} />
          {property.listing_mode === "per_bed" ? (
            <span className="text-muted-foreground">
              {property.available_beds} of {property.total_beds} beds available
            </span>
          ) : null}
          {property.last_confirmed_at ? (
            <span className="text-muted-foreground">· confirmed {formatDate(property.last_confirmed_at)}</span>
          ) : null}
        </div>
        {property.status === "rejected" && property.rejection_reason ? (
          <p className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            <span className="font-semibold">Changes requested: </span>
            {property.rejection_reason}
          </p>
        ) : null}
        {property.status === "pending_review" ? (
          <p className="text-sm text-muted-foreground">In review. You can keep editing; the team sees your latest version.</p>
        ) : null}
        {property.status === "published" ? (
          <p className="text-sm text-muted-foreground">Live. Changes you save appear on the listing straight away.</p>
        ) : null}
        <ListingActions listing={property} onNavigate={open} />
      </div>

      <Tabs value={tab} onValueChange={(value) => open(value as EditorTab)}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList aria-label="Listing sections">
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-none px-4">
                {TAB_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="basics" className="mt-4">
          <Panel>
            <BasicsForm property={property} />
          </Panel>
        </TabsContent>
        <TabsContent value="location" className="mt-4">
          <Panel>
            <LocationForm property={property} cities={cities} />
          </Panel>
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingForm property={property} />
        </TabsContent>
        {property.listing_mode === "per_bed" ? (
          <TabsContent value="rooms" className="mt-4">
            <RoomsEditor propertyId={property.id} rooms={property.rooms} />
          </TabsContent>
        ) : null}
        <TabsContent value="availability" className="mt-4">
          <Panel>
            <AvailabilityForm property={property} />
          </Panel>
        </TabsContent>
        <TabsContent value="amenities" className="mt-4">
          <Panel>
            <AmenitiesForm propertyId={property.id} amenities={amenities} selected={property.amenity_codes} />
          </Panel>
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesAndChargesForm propertyId={property.id} rules={property.rules} charges={property.charges} />
        </TabsContent>
        <TabsContent value="photos" className="mt-4">
          <PhotosEditor propertyId={property.id} media={property.media} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
