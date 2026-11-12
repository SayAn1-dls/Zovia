"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BedDouble, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR, pluralize } from "@/lib/format";

import { addBedAction, deleteBedAction, deleteRoomAction, saveRoomAction, updateBedAction } from "../actions";
import {
  BED_STATUS_LABELS,
  BED_STATUSES,
  ROOM_TYPE_LABELS,
  ROOM_TYPES,
  roomSchema,
  type BedStatus,
  type OwnerBed,
  type OwnerRoom,
  type RoomFormValues,
  type RoomInput,
} from "../schemas";
import { CheckRow } from "./bits";
import { NativeSelect } from "./native-select";

const ROOM_FIELDS = ["name", "room_type", "capacity", "rent_per_bed", "security_deposit", "floor", "description"] as const;

function roomValues(propertyId: string, room: OwnerRoom | null): RoomFormValues {
  return {
    property_id: propertyId,
    ...(room ? { room_id: room.id } : {}),
    name: room?.name ?? "",
    room_type: room?.room_type ?? "shared",
    capacity: room ? String(room.capacity) : "2",
    rent_per_bed: room?.rent_per_bed === null || room?.rent_per_bed === undefined ? "" : String(room.rent_per_bed),
    security_deposit: room?.security_deposit === null || room?.security_deposit === undefined ? "" : String(room.security_deposit),
    has_attached_bathroom: room?.has_attached_bathroom ?? false,
    has_ac: room?.has_ac ?? false,
    has_balcony: room?.has_balcony ?? false,
    floor: room?.floor === null || room?.floor === undefined ? "" : String(room.floor),
    description: room?.description ?? "",
  };
}

function RoomForm({ propertyId, room, onDone }: { propertyId: string; room: OwnerRoom | null; onDone: () => void }) {
  const router = useRouter();
  const form = useForm<RoomFormValues, unknown, RoomInput>({
    resolver: zodResolver(roomSchema),
    defaultValues: roomValues(propertyId, room),
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting } = form.formState;

  async function onSubmit() {
    setFailure(null);
    const result = await saveRoomAction(form.getValues());
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, ROOM_FIELDS);
      setFailure(result.error.message);
      return;
    }
    toast.success(room ? "Room saved" : "Room added. Now add its beds.");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label={room ? `Edit ${room.name}` : "New room"}>
      {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="name" label="Room name">
          {(field) => <Input maxLength={60} placeholder="Room 101" {...field} />}
        </FormField>
        <FormField control={form.control} name="room_type" label="Room type">
          {(field) => (
            <NativeSelect {...field}>
              {ROOM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ROOM_TYPE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="capacity" label="Beds in this room" description="How many people share it (1–12).">
          {(field) => <Input type="number" inputMode="numeric" min={1} max={12} {...field} value={String(field.value ?? "")} />}
        </FormField>
        <FormField control={form.control} name="rent_per_bed" label="Rent per bed (per month)">
          {(field) => <Input inputMode="numeric" placeholder="₹" {...field} value={String(field.value ?? "")} />}
        </FormField>
        <FormField control={form.control} name="security_deposit" label="Deposit per bed" optional>
          {(field) => <Input inputMode="numeric" placeholder="₹" {...field} value={String(field.value ?? "")} />}
        </FormField>
        <FormField control={form.control} name="floor" label="Floor" optional>
          {(field) => <Input inputMode="numeric" {...field} value={String(field.value ?? "")} />}
        </FormField>
      </div>
      <div className="flex flex-wrap gap-x-6">
        {(["has_attached_bathroom", "has_ac", "has_balcony"] as const).map((name) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <CheckRow
                label={name === "has_attached_bathroom" ? "Attached bathroom" : name === "has_ac" ? "Air conditioning" : "Balcony"}
                checked={Boolean(field.value)}
                onChange={field.onChange}
              />
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          {room ? "Save room" : "Add room"}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** One bed: status, "free from" date and an optional rent override ("update vacancies"). */
function BedRow({ bed, onChanged }: { bed: OwnerBed; onChanged: () => void }) {
  const [status, setStatus] = useState<BedStatus>(bed.status);
  const [from, setFrom] = useState(bed.available_from ?? "");
  const [rent, setRent] = useState(bed.rent_override === null ? "" : String(bed.rent_override));
  const [pending, startTransition] = useTransition();
  const dirty = status !== bed.status || from !== (bed.available_from ?? "") || rent !== (bed.rent_override === null ? "" : String(bed.rent_override));

  function save() {
    startTransition(async () => {
      const result = await updateBedAction({ bed_id: bed.id, status, available_from: status === "available" ? from : "", rent_override: rent });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${bed.label} updated`);
      onChanged();
    });
  }

  return (
    <li className="rounded-xl bg-muted/50 p-3" data-testid="bed-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <BedDouble className="size-4" aria-hidden />
          {bed.label}
        </span>
        <StatusBadge status={bed.status} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as BedStatus)} aria-label={`Status of ${bed.label}`}>
            {BED_STATUSES.map((value) => (
              <option key={value} value={value}>
                {BED_STATUS_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Free from
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} disabled={status !== "available"} aria-label={`${bed.label} free from`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Rent for this bed
          <Input inputMode="numeric" placeholder="Room rent" value={rent} onChange={(event) => setRent(event.target.value)} aria-label={`Rent override for ${bed.label}`} />
        </label>
        <div className="flex gap-1">
          <Button size="lg" onClick={save} disabled={!dirty || pending} aria-label={`Save ${bed.label}`}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            <span className="sm:sr-only">Save</span>
          </Button>
          <ConfirmDialog
            title={`Remove ${bed.label}?`}
            description="The bed disappears from the listing and from the bed counts."
            confirmLabel="Remove bed"
            destructive
            onConfirm={async () => {
              const result = await deleteBedAction({ bed_id: bed.id });
              if (!result.ok) throw new Error(result.error.message);
              toast.success(`${bed.label} removed`);
              onChanged();
            }}
            trigger={
              <Button variant="ghost" size="icon-lg" aria-label={`Remove ${bed.label}`}>
                <Trash2 aria-hidden />
              </Button>
            }
          />
        </div>
      </div>
    </li>
  );
}

function RoomCard({ propertyId, room }: { propertyId: string; room: OwnerRoom }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const full = room.beds.length >= room.capacity;
  const available = room.beds.filter((bed) => bed.status === "available").length;

  function addBed() {
    startTransition(async () => {
      const result = await addBedAction({ room_id: room.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Bed added");
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5" data-testid="room-card">
      {editing ? (
        <RoomForm propertyId={propertyId} room={room} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold break-words">{room.name}</h3>
              <p className="text-sm text-muted-foreground">
                {ROOM_TYPE_LABELS[room.room_type]} · {pluralize(room.capacity, "bed")} · {room.rent_per_bed === null ? "rent not set" : `${formatINR(room.rent_per_bed)} per bed`}
                {room.has_attached_bathroom ? " · attached bath" : ""}
                {room.has_ac ? " · AC" : ""}
              </p>
              <p className="mt-1 text-sm font-medium">
                {available} of {pluralize(room.beds.length, "bed")} available
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-lg" onClick={() => setEditing(true)} aria-label={`Edit ${room.name}`}>
                <Pencil aria-hidden />
              </Button>
              <ConfirmDialog
                title={`Delete ${room.name}?`}
                description="The room and its beds are removed from the listing. Enquiries that named it are kept."
                confirmLabel="Delete room"
                destructive
                onConfirm={async () => {
                  const result = await deleteRoomAction({ room_id: room.id });
                  if (!result.ok) throw new Error(result.error.message);
                  toast.success("Room deleted");
                  router.refresh();
                }}
                trigger={
                  <Button variant="ghost" size="icon-lg" aria-label={`Delete ${room.name}`}>
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            </div>
          </div>
          {room.beds.length ? (
            <ul className="mt-4 space-y-2" aria-label={`Beds in ${room.name}`}>
              {room.beds.map((bed) => (
                <BedRow key={`${bed.id}-${bed.status}-${bed.available_from}-${bed.rent_override}`} bed={bed} onChanged={() => router.refresh()} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No beds yet. Add one bed for each person the room holds.</p>
          )}
          <Button variant="outline" size="lg" className="mt-4" onClick={addBed} disabled={full || pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Plus data-icon="inline-start" aria-hidden />}
            {full ? `All ${room.capacity} beds added` : "Add bed"}
          </Button>
        </>
      )}
    </li>
  );
}

/** Rooms and beds of a per-bed listing. Bed statuses drive the listing's availability. */
export function RoomsEditor({ propertyId, rooms }: { propertyId: string; rooms: OwnerRoom[] }) {
  const [adding, setAdding] = useState(rooms.length === 0);
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Bed statuses are your vacancies: keep them current and seekers see exactly how many beds are free.
      </p>
      {rooms.length ? (
        <ul className="space-y-4" aria-label="Rooms">
          {rooms.map((room) => (
            <RoomCard key={room.id} propertyId={propertyId} room={room} />
          ))}
        </ul>
      ) : !adding ? (
        <EmptyState icon={BedDouble} title="No rooms yet" description="Add your first room, then its beds." />
      ) : null}
      {adding ? (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">New room</h3>
            {rooms.length ? (
              <Button variant="ghost" size="icon-lg" aria-label="Close" onClick={() => setAdding(false)}>
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
          <RoomForm propertyId={propertyId} room={null} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <Button size="lg" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" aria-hidden />
          Add a room
        </Button>
      )}
    </div>
  );
}
