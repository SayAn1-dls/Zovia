"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

import { Money } from "@/components/money";
import { cn } from "@/lib/utils";

import { buildCostEstimate, pricedRooms } from "../presenters";
import { ROOM_TYPE_LABELS, type PropertyDetail } from "../schemas";
import { NativeSelect } from "./native-select";

type Props = {
  listing: Pick<
    PropertyDetail,
    | "listing_mode"
    | "monthly_rent"
    | "security_deposit"
    | "maintenance_monthly"
    | "electricity_billing"
    | "electricity_monthly_estimate"
    | "water_billing"
    | "water_monthly_estimate"
    | "food_available"
    | "food_included"
    | "food_monthly_charge"
    | "charges"
    | "rooms"
  >;
};

/**
 * Estimated monthly total and move-in cost, computed by `lib/pricing.ts` from what the owner
 * entered. Per-bed listings pick a room (cheapest first). Unknown amounts are listed as "not
 * stated" and never guessed; the total is then marked as a minimum.
 */
export function PriceBreakdown({ listing }: Props) {
  const rooms = pricedRooms(listing.rooms);
  const [roomId, setRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const selectId = useId();
  const view = buildCostEstimate(listing, roomId);

  if (!view.ok) {
    return (
      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        The owner hasn&apos;t listed the rent yet, so we can&apos;t estimate the monthly cost. Ask them in an enquiry.
      </p>
    );
  }
  const { estimate } = view;

  return (
    <div className="space-y-5">
      {listing.listing_mode === "per_bed" && rooms.length > 1 ? (
        <div className="space-y-1.5">
          <label htmlFor={selectId} className="text-sm font-semibold">
            Room
          </label>
          <NativeSelect id={selectId} value={roomId ?? ""} onChange={(event) => setRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} · {ROOM_TYPE_LABELS[room.room_type]}, {room.capacity} {room.capacity === 1 ? "bed" : "beds"}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Every month</h3>
        <dl className="mt-2 divide-y divide-border text-sm">
          {estimate.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-4 py-2">
              <dt className={cn(!item.counted && "text-muted-foreground")}>{item.label}</dt>
              <dd className="shrink-0 text-right">
                {item.included ? (
                  <span className="text-success-foreground">Included</span>
                ) : item.amount === null ? (
                  <span className="text-muted-foreground">Not stated</span>
                ) : (
                  <Money amount={item.amount} className={cn(!item.counted && "text-muted-foreground")} />
                )}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pt-3">
            <dt className="font-semibold">Estimated monthly total{estimate.incomplete ? " (at least)" : ""}</dt>
            <dd className="text-lg font-bold">
              <Money amount={estimate.monthly_total} />
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Move-in cost (one time)</h3>
        <dl className="mt-2 divide-y divide-border text-sm">
          {estimate.move_in_items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-4 py-2">
              <dt className={cn(!item.counted && "text-muted-foreground")}>{item.label}</dt>
              <dd className="shrink-0">
                {item.amount === null ? (
                  <span className="text-muted-foreground">Not stated</span>
                ) : (
                  <Money amount={item.amount} className={cn(!item.counted && "text-muted-foreground")} />
                )}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pt-3">
            <dt className="font-semibold">To move in{estimate.move_in_incomplete ? " (at least)" : ""}</dt>
            <dd className="text-lg font-bold">
              <Money amount={estimate.move_in_total} />
            </dd>
          </div>
        </dl>
      </div>

      {estimate.notes.length > 0 ? (
        <ul className="space-y-1.5 rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
          {estimate.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
