"use server";

import { z } from "zod";

import { createAction } from "@/server/http/action";

import {
  amenitiesSchema,
  availabilitySchema,
  basicsSchema,
  bedIdSchema,
  becomeOwnerSchema,
  chargesSchema,
  locationSchema,
  inquiryIdSchema,
  mediaIdSchema,
  ownerProfileSchema,
  pricingSchema,
  propertyIdSchema,
  registerMediaSchema,
  reorderMediaSchema,
  replyToReviewSchema,
  roomIdSchema,
  roomSchema,
  rulesSchema,
  setListingStatusSchema,
  updateBasicsSchema,
  updateBedSchema,
  type AvailabilityFormValues,
  type BasicsFormValues,
  type BecomeOwnerFormValues,
  type ChargesFormValues,
  type LocationFormValues,
  type OwnerProfileFormValues,
  type PricingFormValues,
  type RoomFormValues,
  type RulesFormValues,
  type UpdateBedFormValues,
} from "./schemas";
import * as service from "./service";

/**
 * Owner portal Server Actions: validate -> service. Each returns the API envelope shape
 * (`{ ok, data }` / `{ ok: false, error }`) and never throws to the client.
 * "owner" auth = signed in, active, holding the owner role (re-checked by RLS and SQL).
 */

// Becoming an owner: any signed-in active user.
const runBecomeOwner = createAction(
  { auth: "user", label: "owner.become_owner", input: becomeOwnerSchema },
  (ctx, input) => service.becomeOwner(ctx, input),
);
export async function becomeOwnerAction(input: BecomeOwnerFormValues) {
  return runBecomeOwner(input);
}

const runUpdateProfile = createAction(
  { auth: "owner", label: "owner.update_profile", input: ownerProfileSchema },
  (ctx, input) => service.updateOwnerProfile(ctx, input),
);
export async function updateOwnerProfileAction(input: OwnerProfileFormValues) {
  return runUpdateProfile(input);
}

const runCreateProperty = createAction(
  { auth: "owner", label: "owner.create_property", input: basicsSchema },
  (ctx, input) => service.createProperty(ctx, input),
);
export async function createPropertyAction(input: BasicsFormValues) {
  return runCreateProperty(input);
}

const runUpdateBasics = createAction(
  { auth: "owner", label: "owner.update_basics", input: updateBasicsSchema },
  (ctx, input) => service.updateBasics(ctx, input),
);
export async function updateBasicsAction(input: BasicsFormValues & { property_id: string }) {
  return runUpdateBasics(input);
}

const runUpdateLocation = createAction(
  { auth: "owner", label: "owner.update_location", input: locationSchema },
  (ctx, input) => service.updateLocation(ctx, input),
);
export async function updateLocationAction(input: LocationFormValues) {
  return runUpdateLocation(input);
}

const runUpdatePricing = createAction(
  { auth: "owner", label: "owner.update_pricing", input: pricingSchema },
  (ctx, input) => service.updatePricing(ctx, input),
);
export async function updatePricingAction(input: PricingFormValues) {
  return runUpdatePricing(input);
}

const runSaveRoom = createAction(
  { auth: "owner", label: "owner.save_room", input: roomSchema },
  (ctx, input) => service.saveRoom(ctx, input),
);
export async function saveRoomAction(input: RoomFormValues) {
  return runSaveRoom(input);
}

const runDeleteRoom = createAction(
  { auth: "owner", label: "owner.delete_room", input: roomIdSchema },
  (ctx, input) => service.deleteRoom(ctx, input.room_id),
);
export async function deleteRoomAction(input: { room_id: string }) {
  return runDeleteRoom(input);
}

const runAddBed = createAction(
  { auth: "owner", label: "owner.add_bed", input: roomIdSchema },
  (ctx, input) => service.addNextBed(ctx, input.room_id),
);
export async function addBedAction(input: { room_id: string }) {
  return runAddBed(input);
}

const runUpdateBed = createAction(
  { auth: "owner", label: "owner.update_bed", input: updateBedSchema },
  (ctx, input) => service.updateBed(ctx, input),
);
export async function updateBedAction(input: UpdateBedFormValues) {
  return runUpdateBed(input);
}

const runDeleteBed = createAction(
  { auth: "owner", label: "owner.delete_bed", input: bedIdSchema },
  (ctx, input) => service.deleteBed(ctx, input.bed_id),
);
export async function deleteBedAction(input: { bed_id: string }) {
  return runDeleteBed(input);
}

const runUpdateAvailability = createAction(
  { auth: "owner", label: "owner.update_availability", input: availabilitySchema },
  (ctx, input) => service.updateAvailability(ctx, input),
);
export async function updateAvailabilityAction(input: AvailabilityFormValues) {
  return runUpdateAvailability(input);
}

const runSetAmenities = createAction(
  { auth: "owner", label: "owner.set_amenities", input: amenitiesSchema },
  (ctx, input) => service.setAmenities(ctx, input),
);
export async function setAmenitiesAction(input: { property_id: string; amenity_codes: string[] }) {
  return runSetAmenities(input);
}

const runSaveRules = createAction(
  { auth: "owner", label: "owner.save_rules", input: rulesSchema },
  (ctx, input) => service.saveRules(ctx, input),
);
export async function saveRulesAction(input: RulesFormValues) {
  return runSaveRules(input);
}

const runSaveCharges = createAction(
  { auth: "owner", label: "owner.save_charges", input: chargesSchema },
  (ctx, input) => service.saveCharges(ctx, input),
);
export async function saveChargesAction(input: ChargesFormValues) {
  return runSaveCharges(input);
}

const runRegisterMedia = createAction(
  { auth: "owner", label: "owner.register_media", input: registerMediaSchema, rateLimit: { max: 120, windowSeconds: 3600 } },
  (ctx, input) => service.registerMedia(ctx, input),
);
export async function registerMediaAction(input: z.input<typeof registerMediaSchema>) {
  return runRegisterMedia(input);
}

const discardUploadSchema = z.object({ property_id: z.uuid(), storage_path: z.string().max(300) });
const runDiscardUpload = createAction(
  { auth: "owner", label: "owner.discard_upload", input: discardUploadSchema },
  (ctx, input) => service.discardUpload(ctx, input),
);
export async function discardUploadAction(input: { property_id: string; storage_path: string }) {
  return runDiscardUpload(input);
}

const runSetCover = createAction(
  { auth: "owner", label: "owner.set_cover", input: mediaIdSchema },
  (ctx, input) => service.setCoverMedia(ctx, input.media_id),
);
export async function setCoverAction(input: { media_id: string }) {
  return runSetCover(input);
}

const runReorderMedia = createAction(
  { auth: "owner", label: "owner.reorder_media", input: reorderMediaSchema },
  (ctx, input) => service.reorderMedia(ctx, input),
);
export async function reorderMediaAction(input: { property_id: string; media_ids: string[] }) {
  return runReorderMedia(input);
}

const runDeleteMedia = createAction(
  { auth: "owner", label: "owner.delete_media", input: mediaIdSchema },
  (ctx, input) => service.deleteMedia(ctx, input.media_id),
);
export async function deleteMediaAction(input: { media_id: string }) {
  return runDeleteMedia(input);
}

const runSubmit = createAction(
  { auth: "owner", label: "owner.submit_for_review", input: propertyIdSchema },
  (ctx, input) => service.submitForReview(ctx, input.property_id),
);
export async function submitForReviewAction(input: { property_id: string }) {
  return runSubmit(input);
}

const runSetStatus = createAction(
  { auth: "owner", label: "owner.set_listing_status", input: setListingStatusSchema },
  (ctx, input) => service.setListingStatus(ctx, input),
);
export async function setListingStatusAction(input: { property_id: string; status: "published" | "paused" | "archived" }) {
  return runSetStatus(input);
}

const runConfirm = createAction(
  { auth: "owner", label: "owner.confirm_listing", input: propertyIdSchema },
  (ctx, input) => service.confirmListing(ctx, input.property_id),
);
export async function confirmListingAction(input: { property_id: string }) {
  return runConfirm(input);
}

const runStartChat = createAction(
  { auth: "owner", label: "owner.start_inquiry_conversation", input: inquiryIdSchema },
  (ctx, input) => service.startInquiryConversation(ctx, input.inquiry_id),
);
export async function startInquiryConversationAction(input: { inquiry_id: string }) {
  return runStartChat(input);
}

const runReply = createAction(
  { auth: "owner", label: "owner.reply_to_review", input: replyToReviewSchema },
  (ctx, input) => service.replyToReview(ctx, input),
);
export async function replyToReviewAction(input: { review_id: string; body: string }) {
  return runReply(input);
}
