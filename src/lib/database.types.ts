
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage_logs": {
                  Row: {
                    "created_at": string,"error_code": string | null,"feature": string,"id": string,"input_tokens": number,"latency_ms": number | null,"model": string,"output_tokens": number,"provider": string,"status": string,"tool_calls": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error_code"?: string | null,"feature": string,"id"?: string,"input_tokens"?: number,"latency_ms"?: number | null,"model": string,"output_tokens"?: number,"provider": string,"status"?: string,"tool_calls"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"error_code"?: string | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"latency_ms"?: number | null,"model"?: string,"output_tokens"?: number,"provider"?: string,"status"?: string,"tool_calls"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_logs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"amenities": {
                  Row: {
                    "category": string,"code": string,"created_at": string,"icon": string,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"code": string,"created_at"?: string,"icon": string,"name": string,"position"?: number
                  }
                  Update: {
                    "category"?: string,"code"?: string,"created_at"?: string,"icon"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"appeals": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"moderation_action_id": string,"statement": string,"status": Database["public"]['Enums']["appeal_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"moderation_action_id": string,"statement": string,"status"?: Database["public"]['Enums']["appeal_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"moderation_action_id"?: string,"statement"?: string,"status"?: Database["public"]['Enums']["appeal_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appeals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_moderation_action_id_fkey"
      columns: ["moderation_action_id"]
isOneToOne: true
      referencedRelation: "moderation_actions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"beds": {
                  Row: {
                    "available_from": string | null,"created_at": string,"id": string,"label": string,"property_id": string,"rent_override": number | null,"room_id": string,"status": Database["public"]['Enums']["bed_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available_from"?: string | null,"created_at"?: string,"id"?: string,"label": string,"property_id": string,"rent_override"?: number | null,"room_id": string,"status"?: Database["public"]['Enums']["bed_status"],"updated_at"?: string
                  }
                  Update: {
                    "available_from"?: string | null,"created_at"?: string,"id"?: string,"label"?: string,"property_id"?: string,"rent_override"?: number | null,"room_id"?: string,"status"?: Database["public"]['Enums']["bed_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "beds_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beds_room_property_fkey"
      columns: ["room_id","property_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","property_id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "amount_inr": number,"amount_kind": Database["public"]['Enums']["booking_amount_kind"],"bed_id": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"confirmed_at": string | null,"created_at": string,"decided_at": string | null,"decline_reason": string | null,"id": string,"monthly_rent_inr": number,"move_in_date": string,"note": string | null,"owner_id": string,"pay_by": string | null,"property_id": string,"respond_by": string,"room_id": string | null,"seeker_id": string,"status": Database["public"]['Enums']["booking_status"],"stay_months": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_inr": number,"amount_kind": Database["public"]['Enums']["booking_amount_kind"],"bed_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decline_reason"?: string | null,"id"?: string,"monthly_rent_inr": number,"move_in_date": string,"note"?: string | null,"owner_id": string,"pay_by"?: string | null,"property_id": string,"respond_by": string,"room_id"?: string | null,"seeker_id": string,"status"?: Database["public"]['Enums']["booking_status"],"stay_months": number,"updated_at"?: string
                  }
                  Update: {
                    "amount_inr"?: number,"amount_kind"?: Database["public"]['Enums']["booking_amount_kind"],"bed_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decline_reason"?: string | null,"id"?: string,"monthly_rent_inr"?: number,"move_in_date"?: string,"note"?: string | null,"owner_id"?: string,"pay_by"?: string | null,"property_id"?: string,"respond_by"?: string,"room_id"?: string | null,"seeker_id"?: string,"status"?: Database["public"]['Enums']["booking_status"],"stay_months"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_bed_id_fkey"
      columns: ["bed_id"]
isOneToOne: false
      referencedRelation: "beds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owner_cards"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "bookings_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owners"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "bookings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_seeker_id_fkey"
      columns: ["seeker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"cities": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"location": unknown,"name": string,"position": number,"slug": string,"state": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"location": unknown,"name": string,"position"?: number,"slug": string,"state": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"location"?: unknown,"name"?: string,"position"?: number,"slug"?: string,"state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"compatibility_results": {
                  Row: {
                    "algorithm_version": number,"breakdown": NonNullable<Json>,"candidate_id": string,"computed_at": string,"conflicts": (string)[],"score": number,"shared": (string)[],"viewer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "algorithm_version": number,"breakdown"?: NonNullable<Json>,"candidate_id": string,"computed_at"?: string,"conflicts"?: (string)[],"score": number,"shared"?: (string)[],"viewer_id": string
                  }
                  Update: {
                    "algorithm_version"?: number,"breakdown"?: NonNullable<Json>,"candidate_id"?: string,"computed_at"?: string,"conflicts"?: (string)[],"score"?: number,"shared"?: (string)[],"viewer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compatibility_results_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compatibility_results_viewer_id_fkey"
      columns: ["viewer_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"compatibility_weights": {
                  Row: {
                    "factor": string,"updated_at": string,"updated_by": string | null,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "factor": string,"updated_at"?: string,"updated_by"?: string | null,"weight": number
                  }
                  Update: {
                    "factor"?: string,"updated_at"?: string,"updated_by"?: string | null,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "compatibility_weights_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_messages": {
                  Row: {
                    "created_at": string,"email": string,"handled_at": string | null,"handled_by": string | null,"id": string,"message": string,"name": string,"phone": string | null,"staff_note": string | null,"status": string,"subject": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"message": string,"name": string,"phone"?: string | null,"staff_note"?: string | null,"status"?: string,"subject": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"message"?: string,"name"?: string,"phone"?: string | null,"staff_note"?: string | null,"status"?: string,"subject"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_messages_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_reveals": {
                  Row: {
                    "created_at": string,"id": string,"property_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"property_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"property_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_reveals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_reveals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": string,"joined_at": string,"last_read_at": string | null,"left_at": string | null,"muted": boolean,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted"?: boolean,"role"?: string,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted"?: boolean,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"id": string,"inquiry_id": string | null,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at": string | null,"last_message_preview": string | null,"match_id": string | null,"property_id": string | null,"status": Database["public"]['Enums']["conversation_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"inquiry_id"?: string | null,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at"?: string | null,"last_message_preview"?: string | null,"match_id"?: string | null,"property_id"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"inquiry_id"?: string | null,"kind"?: Database["public"]['Enums']["conversation_kind"],"last_message_at"?: string | null,"last_message_preview"?: string | null,"match_id"?: string | null,"property_id"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: true
      referencedRelation: "property_inquiries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_match_id_fkey"
      columns: ["match_id"]
isOneToOne: true
      referencedRelation: "roommate_matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"lifestyle_questions": {
                  Row: {
                    "code": string,"created_at": string,"factor": string,"is_active": boolean,"kind": string,"options": NonNullable<Json>,"position": number,"prompt": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"factor": string,"is_active"?: boolean,"kind": string,"options": NonNullable<Json>,"position"?: number,"prompt": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"factor"?: string,"is_active"?: boolean,"kind"?: string,"options"?: NonNullable<Json>,"position"?: number,"prompt"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"message_attachments": {
                  Row: {
                    "created_at": string,"height": number | null,"id": string,"message_id": string,"mime_type": string,"moderation": Database["public"]['Enums']["message_moderation"],"size_bytes": number,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"height"?: number | null,"id"?: string,"message_id": string,"mime_type": string,"moderation"?: Database["public"]['Enums']["message_moderation"],"size_bytes": number,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"height"?: number | null,"id"?: string,"message_id"?: string,"mime_type"?: string,"moderation"?: Database["public"]['Enums']["message_moderation"],"size_bytes"?: number,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_attachments_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"message_reports": {
                  Row: {
                    "conversation_id": string | null,"created_at": string,"details": string | null,"id": string,"message_id": string | null,"reason": string,"reported_user_id": string | null,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"snapshot": NonNullable<Json>,"status": Database["public"]['Enums']["report_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id"?: string | null,"created_at"?: string,"details"?: string | null,"id"?: string,"message_id"?: string | null,"reason": string,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["report_status"],"updated_at"?: string
                  }
                  Update: {
                    "conversation_id"?: string | null,"created_at"?: string,"details"?: string | null,"id"?: string,"message_id"?: string | null,"reason"?: string,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["report_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reports_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"kind": Database["public"]['Enums']["message_kind"],"moderation": Database["public"]['Enums']["message_moderation"],"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"moderation"?: Database["public"]['Enums']["message_moderation"],"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"moderation"?: Database["public"]['Enums']["message_moderation"],"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_actions": {
                  Row: {
                    "action": Database["public"]['Enums']["moderation_action_kind"],"actor_id": string | null,"created_at": string,"expires_at": string | null,"id": string,"message_report_id": string | null,"reason": string,"report_id": string | null,"target_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["moderation_action_kind"],"actor_id"?: string | null,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"message_report_id"?: string | null,"reason": string,"report_id"?: string | null,"target_user_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["moderation_action_kind"],"actor_id"?: string | null,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"message_report_id"?: string | null,"reason"?: string,"report_id"?: string | null,"target_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_actions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_message_report_id_fkey"
      columns: ["message_report_id"]
isOneToOne: false
      referencedRelation: "message_reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"link_path": string | null,"read_at": string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"link_path"?: string | null,"read_at"?: string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"link_path"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"owner_replies": {
                  Row: {
                    "body": string,"created_at": string,"owner_id": string,"review_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"owner_id": string,"review_id": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"owner_id"?: string,"review_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "owner_replies_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owner_cards"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "owner_replies_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owners"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "owner_replies_review_id_fkey"
      columns: ["review_id"]
isOneToOne: true
      referencedRelation: "property_reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_paise": number,"booking_id": string,"created_at": string,"currency": string,"id": string,"paid_at": string | null,"provider": string,"provider_order_id": string,"provider_payment_id": string | null,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"booking_id": string,"created_at"?: string,"currency"?: string,"id"?: string,"paid_at"?: string | null,"provider"?: string,"provider_order_id": string,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_paise"?: number,"booking_id"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"paid_at"?: string | null,"provider"?: string,"provider_order_id"?: string,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"places": {
                  Row: {
                    "city": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["place_kind"],"location": unknown,"name": string,"source": string,"source_ref": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["place_kind"],"location": unknown,"name": string,"source": string,"source_ref": string,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["place_kind"],"location"?: unknown,"name"?: string,"source"?: string,"source_ref"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "created_at": string,"description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"properties": {
                  Row: {
                    "address_line": string | null,"amenity_codes": (string)[],"approved_at": string | null,"available_beds": number,"city": string | null,"cover_media_path": string | null,"created_at": string,"deleted_at": string | null,"description": string | null,"electricity_billing": Database["public"]['Enums']["utility_billing"] | null,"electricity_monthly_estimate": number | null,"food_available": boolean,"food_included": boolean,"food_monthly_charge": number | null,"furnishing": Database["public"]['Enums']["furnishing"] | null,"has_ac": boolean,"has_attached_bathroom": boolean,"id": string,"landmark": string | null,"last_confirmed_at": string | null,"listing_mode": Database["public"]['Enums']["listing_mode"],"locality": string | null,"location": unknown,"maintenance_monthly": number | null,"max_rent": number | null,"meals_breakfast": boolean,"meals_dinner": boolean,"meals_lunch": boolean,"min_rent": number | null,"monthly_rent": number | null,"occupancy_options": (number)[],"owner_id": string,"pincode": string | null,"property_type": Database["public"]['Enums']["property_type"],"published_at": string | null,"rating_avg": number | null,"rating_count": number,"rejection_reason": string | null,"search_tsv": unknown,"security_deposit": number | null,"slug": string,"state": string | null,"status": Database["public"]['Enums']["listing_status"],"submitted_at": string | null,"tenant_gender": Database["public"]['Enums']["tenant_gender"],"title": string,"total_beds": number,"updated_at": string,"water_billing": Database["public"]['Enums']["utility_billing"] | null,"water_monthly_estimate": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line"?: string | null,"amenity_codes"?: (string)[],"approved_at"?: string | null,"available_beds"?: number,"city"?: string | null,"cover_media_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"electricity_billing"?: Database["public"]['Enums']["utility_billing"] | null,"electricity_monthly_estimate"?: number | null,"food_available"?: boolean,"food_included"?: boolean,"food_monthly_charge"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"has_ac"?: boolean,"has_attached_bathroom"?: boolean,"id"?: string,"landmark"?: string | null,"last_confirmed_at"?: string | null,"listing_mode": Database["public"]['Enums']["listing_mode"],"locality"?: string | null,"location"?: unknown,"maintenance_monthly"?: number | null,"max_rent"?: number | null,"meals_breakfast"?: boolean,"meals_dinner"?: boolean,"meals_lunch"?: boolean,"min_rent"?: number | null,"monthly_rent"?: number | null,"occupancy_options"?: (number)[],"owner_id": string,"pincode"?: string | null,"property_type": Database["public"]['Enums']["property_type"],"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"search_tsv"?: unknown,"security_deposit"?: number | null,"slug": string,"state"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"tenant_gender"?: Database["public"]['Enums']["tenant_gender"],"title": string,"total_beds"?: number,"updated_at"?: string,"water_billing"?: Database["public"]['Enums']["utility_billing"] | null,"water_monthly_estimate"?: number | null
                  }
                  Update: {
                    "address_line"?: string | null,"amenity_codes"?: (string)[],"approved_at"?: string | null,"available_beds"?: number,"city"?: string | null,"cover_media_path"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"electricity_billing"?: Database["public"]['Enums']["utility_billing"] | null,"electricity_monthly_estimate"?: number | null,"food_available"?: boolean,"food_included"?: boolean,"food_monthly_charge"?: number | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"has_ac"?: boolean,"has_attached_bathroom"?: boolean,"id"?: string,"landmark"?: string | null,"last_confirmed_at"?: string | null,"listing_mode"?: Database["public"]['Enums']["listing_mode"],"locality"?: string | null,"location"?: unknown,"maintenance_monthly"?: number | null,"max_rent"?: number | null,"meals_breakfast"?: boolean,"meals_dinner"?: boolean,"meals_lunch"?: boolean,"min_rent"?: number | null,"monthly_rent"?: number | null,"occupancy_options"?: (number)[],"owner_id"?: string,"pincode"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"],"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"search_tsv"?: unknown,"security_deposit"?: number | null,"slug"?: string,"state"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"submitted_at"?: string | null,"tenant_gender"?: Database["public"]['Enums']["tenant_gender"],"title"?: string,"total_beds"?: number,"updated_at"?: string,"water_billing"?: Database["public"]['Enums']["utility_billing"] | null,"water_monthly_estimate"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owner_cards"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "properties_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "property_owners"
      referencedColumns: ["user_id"]
    }
                  ]
                },"property_amenities": {
                  Row: {
                    "amenity_code": string,"created_at": string,"property_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amenity_code": string,"created_at"?: string,"property_id": string
                  }
                  Update: {
                    "amenity_code"?: string,"created_at"?: string,"property_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_amenities_amenity_code_fkey"
      columns: ["amenity_code"]
isOneToOne: false
      referencedRelation: "amenities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "property_amenities_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_availability": {
                  Row: {
                    "available_from": string | null,"confirmed_by": string | null,"created_at": string,"last_confirmed_at": string | null,"min_stay_months": number | null,"notice_period_days": number | null,"property_id": string,"status": Database["public"]['Enums']["availability_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available_from"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"last_confirmed_at"?: string | null,"min_stay_months"?: number | null,"notice_period_days"?: number | null,"property_id": string,"status"?: Database["public"]['Enums']["availability_status"],"updated_at"?: string
                  }
                  Update: {
                    "available_from"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"last_confirmed_at"?: string | null,"min_stay_months"?: number | null,"notice_period_days"?: number | null,"property_id"?: string,"status"?: Database["public"]['Enums']["availability_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_availability_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_availability_property_id_fkey"
      columns: ["property_id"]
isOneToOne: true
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_charges": {
                  Row: {
                    "amount": number,"created_at": string,"frequency": Database["public"]['Enums']["charge_frequency"],"id": string,"is_mandatory": boolean,"label": string,"position": number,"property_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"frequency"?: Database["public"]['Enums']["charge_frequency"],"id"?: string,"is_mandatory"?: boolean,"label": string,"position"?: number,"property_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"frequency"?: Database["public"]['Enums']["charge_frequency"],"id"?: string,"is_mandatory"?: boolean,"label"?: string,"position"?: number,"property_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_charges_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_inquiries": {
                  Row: {
                    "bed_id": string | null,"conversation_id": string | null,"created_at": string,"id": string,"message": string,"move_in_date": string | null,"occupants": number,"owner_responded_at": string | null,"property_id": string,"room_id": string | null,"seeker_id": string,"status": Database["public"]['Enums']["inquiry_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bed_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"id"?: string,"message": string,"move_in_date"?: string | null,"occupants"?: number,"owner_responded_at"?: string | null,"property_id": string,"room_id"?: string | null,"seeker_id": string,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string
                  }
                  Update: {
                    "bed_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"id"?: string,"message"?: string,"move_in_date"?: string | null,"occupants"?: number,"owner_responded_at"?: string | null,"property_id"?: string,"room_id"?: string | null,"seeker_id"?: string,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_inquiries_bed_property_fkey"
      columns: ["bed_id","property_id"]
isOneToOne: false
      referencedRelation: "beds"
      referencedColumns: ["id","property_id"]
    },{
      foreignKeyName: "property_inquiries_conversation_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_inquiries_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_inquiries_room_property_fkey"
      columns: ["room_id","property_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","property_id"]
    },{
      foreignKeyName: "property_inquiries_seeker_id_fkey"
      columns: ["seeker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"property_media": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"height": number | null,"id": string,"is_cover": boolean,"kind": Database["public"]['Enums']["media_kind"],"position": number,"property_id": string,"room_id": string | null,"size_bytes": number | null,"storage_path": string,"updated_at": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"position"?: number,"property_id": string,"room_id"?: string | null,"size_bytes"?: number | null,"storage_path": string,"updated_at"?: string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"position"?: number,"property_id"?: string,"room_id"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"updated_at"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_media_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_media_room_property_fkey"
      columns: ["room_id","property_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","property_id"]
    }
                  ]
                },"property_nearby_places": {
                  Row: {
                    "created_at": string,"place_id": string,"property_id": string,"route_distance_m": number | null,"straight_line_m": number,"travel_mode": string | null,"travel_time_s": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"place_id": string,"property_id": string,"route_distance_m"?: number | null,"straight_line_m": number,"travel_mode"?: string | null,"travel_time_s"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"place_id"?: string,"property_id"?: string,"route_distance_m"?: number | null,"straight_line_m"?: number,"travel_mode"?: string | null,"travel_time_s"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_nearby_places_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_nearby_places_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_owners": {
                  Row: {
                    "about": string | null,"business_name": string | null,"contact_email": string | null,"contact_phone": string | null,"created_at": string,"owner_type": Database["public"]['Enums']["owner_type"],"phone_verified_at": string | null,"updated_at": string,"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"verified_by": string | null,"whatsapp_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"business_name"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"owner_type"?: Database["public"]['Enums']["owner_type"],"phone_verified_at"?: string | null,"updated_at"?: string,"user_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null,"whatsapp_number"?: string | null
                  }
                  Update: {
                    "about"?: string | null,"business_name"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"owner_type"?: Database["public"]['Enums']["owner_type"],"phone_verified_at"?: string | null,"updated_at"?: string,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null,"whatsapp_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_owners_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_owners_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"property_reviews": {
                  Row: {
                    "author_id": string,"body": string | null,"created_at": string,"deleted_at": string | null,"id": string,"property_id": string,"rating": number,"status": Database["public"]['Enums']["review_status"],"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"property_id": string,"rating": number,"status"?: Database["public"]['Enums']["review_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"property_id"?: string,"rating"?: number,"status"?: Database["public"]['Enums']["review_status"],"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_reviews_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_reviews_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_rules": {
                  Row: {
                    "allowed": boolean | null,"created_at": string,"id": string,"note": string | null,"property_id": string,"rule_code": string,"updated_at": string,"value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed"?: boolean | null,"created_at"?: string,"id"?: string,"note"?: string | null,"property_id": string,"rule_code": string,"updated_at"?: string,"value"?: string | null
                  }
                  Update: {
                    "allowed"?: boolean | null,"created_at"?: string,"id"?: string,"note"?: string | null,"property_id"?: string,"rule_code"?: string,"updated_at"?: string,"value"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_rules_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_stats_daily": {
                  Row: {
                    "contact_reveals": number,"day": string,"inquiries": number,"property_id": string,"saves": number,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_reveals"?: number,"day": string,"inquiries"?: number,"property_id": string,"saves"?: number,"views"?: number
                  }
                  Update: {
                    "contact_reveals"?: number,"day"?: string,"inquiries"?: number,"property_id"?: string,"saves"?: number,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_stats_daily_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"property_verifications": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["property_verification_kind"],"notes": string | null,"property_id": string,"record_id": string | null,"status": Database["public"]['Enums']["verification_status"],"updated_at": string,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["property_verification_kind"],"notes"?: string | null,"property_id": string,"record_id"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["property_verification_kind"],"notes"?: string | null,"property_id"?: string,"record_id"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_verifications_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_verifications_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "verification_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_verifications_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"expires_at": string,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count": number,"expires_at": string,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"expires_at"?: string,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"reason_code": string,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason_code": string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason_code"?: string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"roommate_deal_breakers": {
                  Row: {
                    "code": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_deal_breakers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "roommate_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"roommate_lifestyle_answers": {
                  Row: {
                    "created_at": string,"question_code": string,"updated_at": string,"user_id": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"question_code": string,"updated_at"?: string,"user_id": string,"value": number
                  }
                  Update: {
                    "created_at"?: string,"question_code"?: string,"updated_at"?: string,"user_id"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_lifestyle_answers_question_code_fkey"
      columns: ["question_code"]
isOneToOne: false
      referencedRelation: "lifestyle_questions"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "roommate_lifestyle_answers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "roommate_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"roommate_likes": {
                  Row: {
                    "action": Database["public"]['Enums']["swipe_action"],"created_at": string,"liked_id": string,"liker_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["swipe_action"],"created_at"?: string,"liked_id": string,"liker_id": string,"updated_at"?: string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["swipe_action"],"created_at"?: string,"liked_id"?: string,"liker_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_likes_liked_id_fkey"
      columns: ["liked_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roommate_likes_liker_id_fkey"
      columns: ["liker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"roommate_matches": {
                  Row: {
                    "conversation_id": string | null,"created_at": string,"ended_at": string | null,"ended_by": string | null,"id": string,"matched_at": string,"status": Database["public"]['Enums']["match_status"],"updated_at": string,"user_a": string,"user_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id"?: string | null,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"matched_at"?: string,"status"?: Database["public"]['Enums']["match_status"],"updated_at"?: string,"user_a": string,"user_b": string
                  }
                  Update: {
                    "conversation_id"?: string | null,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"matched_at"?: string,"status"?: Database["public"]['Enums']["match_status"],"updated_at"?: string,"user_a"?: string,"user_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_matches_conversation_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roommate_matches_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roommate_matches_user_a_fkey"
      columns: ["user_a"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roommate_matches_user_b_fkey"
      columns: ["user_b"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"roommate_places": {
                  Row: {
                    "available_from": string | null,"city": string | null,"created_at": string,"deposit_share": number | null,"description": string | null,"furnishing": Database["public"]['Enums']["furnishing"] | null,"locality": string | null,"location": unknown,"property_id": string | null,"property_type": Database["public"]['Enums']["property_type"] | null,"rent_share": number | null,"title": string,"updated_at": string,"user_id": string,"vacancies": number
                  }
                  ComputedFields: never
                  Insert: {
                    "available_from"?: string | null,"city"?: string | null,"created_at"?: string,"deposit_share"?: number | null,"description"?: string | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"locality"?: string | null,"location"?: unknown,"property_id"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"] | null,"rent_share"?: number | null,"title": string,"updated_at"?: string,"user_id": string,"vacancies"?: number
                  }
                  Update: {
                    "available_from"?: string | null,"city"?: string | null,"created_at"?: string,"deposit_share"?: number | null,"description"?: string | null,"furnishing"?: Database["public"]['Enums']["furnishing"] | null,"locality"?: string | null,"location"?: unknown,"property_id"?: string | null,"property_type"?: Database["public"]['Enums']["property_type"] | null,"rent_share"?: number | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"vacancies"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_places_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roommate_places_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "roommate_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"roommate_preferences": {
                  Row: {
                    "age_max": number | null,"age_min": number | null,"created_at": string,"occupation_prefs": (Database["public"]['Enums']["occupation_type"])[],"preferred_genders": (Database["public"]['Enums']["gender"])[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_max"?: number | null,"age_min"?: number | null,"created_at"?: string,"occupation_prefs"?: (Database["public"]['Enums']["occupation_type"])[],"preferred_genders"?: (Database["public"]['Enums']["gender"])[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "age_max"?: number | null,"age_min"?: number | null,"created_at"?: string,"occupation_prefs"?: (Database["public"]['Enums']["occupation_type"])[],"preferred_genders"?: (Database["public"]['Enums']["gender"])[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "roommate_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"roommate_profile_photos": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"storage_path": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_profile_photos_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "roommate_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"roommate_profiles": {
                  Row: {
                    "about": string | null,"age": number | null,"budget_max": number | null,"budget_min": number | null,"city": string | null,"created_at": string,"gender": Database["public"]['Enums']["gender"] | null,"has_place": boolean,"headline": string | null,"last_active_at": string,"location": unknown,"move_in_date": string | null,"occupation": Database["public"]['Enums']["occupation_type"] | null,"occupation_detail": string | null,"preferred_localities": (string)[],"status": Database["public"]['Enums']["roommate_profile_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"age"?: number | null,"budget_max"?: number | null,"budget_min"?: number | null,"city"?: string | null,"created_at"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"has_place"?: boolean,"headline"?: string | null,"last_active_at"?: string,"location"?: unknown,"move_in_date"?: string | null,"occupation"?: Database["public"]['Enums']["occupation_type"] | null,"occupation_detail"?: string | null,"preferred_localities"?: (string)[],"status"?: Database["public"]['Enums']["roommate_profile_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "about"?: string | null,"age"?: number | null,"budget_max"?: number | null,"budget_min"?: number | null,"city"?: string | null,"created_at"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"has_place"?: boolean,"headline"?: string | null,"last_active_at"?: string,"location"?: unknown,"move_in_date"?: string | null,"occupation"?: Database["public"]['Enums']["occupation_type"] | null,"occupation_detail"?: string | null,"preferred_localities"?: (string)[],"status"?: Database["public"]['Enums']["roommate_profile_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roommate_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "area_sqft": number | null,"capacity": number,"created_at": string,"deleted_at": string | null,"description": string | null,"floor": number | null,"has_ac": boolean,"has_attached_bathroom": boolean,"has_balcony": boolean,"id": string,"name": string,"position": number,"property_id": string,"rent_per_bed": number | null,"room_type": Database["public"]['Enums']["room_type"],"security_deposit": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_sqft"?: number | null,"capacity"?: number,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"floor"?: number | null,"has_ac"?: boolean,"has_attached_bathroom"?: boolean,"has_balcony"?: boolean,"id"?: string,"name": string,"position"?: number,"property_id": string,"rent_per_bed"?: number | null,"room_type"?: Database["public"]['Enums']["room_type"],"security_deposit"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "area_sqft"?: number | null,"capacity"?: number,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"floor"?: number | null,"has_ac"?: boolean,"has_attached_bathroom"?: boolean,"has_balcony"?: boolean,"id"?: string,"name"?: string,"position"?: number,"property_id"?: string,"rent_per_bed"?: number | null,"room_type"?: Database["public"]['Enums']["room_type"],"security_deposit"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_properties": {
                  Row: {
                    "created_at": string,"property_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"property_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"property_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_properties_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_properties_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"search_history": {
                  Row: {
                    "created_at": string,"filters": NonNullable<Json>,"id": string,"query_text": string | null,"result_count": number | null,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"query_text"?: string | null,"result_count"?: number | null,"source"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"query_text"?: string | null,"result_count"?: number | null,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_history_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "budget_max": number | null,"budget_min": number | null,"created_at": string,"email_notifications": boolean,"marketing_opt_in": boolean,"move_in_date": string | null,"occupancy_prefs": (number)[],"preferred_city": string | null,"preferred_localities": (string)[],"property_types": (Database["public"]['Enums']["property_type"])[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_max"?: number | null,"budget_min"?: number | null,"created_at"?: string,"email_notifications"?: boolean,"marketing_opt_in"?: boolean,"move_in_date"?: string | null,"occupancy_prefs"?: (number)[],"preferred_city"?: string | null,"preferred_localities"?: (string)[],"property_types"?: (Database["public"]['Enums']["property_type"])[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "budget_max"?: number | null,"budget_min"?: number | null,"created_at"?: string,"email_notifications"?: boolean,"marketing_opt_in"?: boolean,"move_in_date"?: string | null,"occupancy_prefs"?: (number)[],"preferred_city"?: string | null,"preferred_localities"?: (string)[],"property_types"?: (Database["public"]['Enums']["property_type"])[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_profiles": {
                  Row: {
                    "academic_year": number | null,"avatar_path": string | null,"bio": string | null,"college_name": string | null,"company": string | null,"course": string | null,"created_at": string,"display_name": string,"gender": Database["public"]['Enums']["gender"] | null,"home_city": string | null,"industry": string | null,"occupation": Database["public"]['Enums']["occupation_type"] | null,"updated_at": string,"user_id": string,"work_location": string | null,"work_schedule": Database["public"]['Enums']["work_schedule"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year"?: number | null,"avatar_path"?: string | null,"bio"?: string | null,"college_name"?: string | null,"company"?: string | null,"course"?: string | null,"created_at"?: string,"display_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"home_city"?: string | null,"industry"?: string | null,"occupation"?: Database["public"]['Enums']["occupation_type"] | null,"updated_at"?: string,"user_id": string,"work_location"?: string | null,"work_schedule"?: Database["public"]['Enums']["work_schedule"] | null
                  }
                  Update: {
                    "academic_year"?: number | null,"avatar_path"?: string | null,"bio"?: string | null,"college_name"?: string | null,"company"?: string | null,"course"?: string | null,"created_at"?: string,"display_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"home_city"?: string | null,"industry"?: string | null,"occupation"?: Database["public"]['Enums']["occupation_type"] | null,"updated_at"?: string,"user_id"?: string,"work_location"?: string | null,"work_schedule"?: Database["public"]['Enums']["work_schedule"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_restrictions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"kind": Database["public"]['Enums']["restriction_kind"],"lifted_at": string | null,"lifted_by": string | null,"moderation_action_id": string | null,"reason": string,"starts_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["restriction_kind"],"lifted_at"?: string | null,"lifted_by"?: string | null,"moderation_action_id"?: string | null,"reason": string,"starts_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["restriction_kind"],"lifted_at"?: string | null,"lifted_by"?: string | null,"moderation_action_id"?: string | null,"reason"?: string,"starts_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_restrictions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_restrictions_lifted_by_fkey"
      columns: ["lifted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_restrictions_moderation_action_fkey"
      columns: ["moderation_action_id"]
isOneToOne: false
      referencedRelation: "moderation_actions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_restrictions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_violations": {
                  Row: {
                    "conversation_id": string | null,"created_at": string,"detected": NonNullable<Json>,"id": string,"kind": Database["public"]['Enums']["violation_kind"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id"?: string | null,"created_at"?: string,"detected"?: NonNullable<Json>,"id"?: string,"kind": Database["public"]['Enums']["violation_kind"],"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string | null,"created_at"?: string,"detected"?: NonNullable<Json>,"id"?: string,"kind"?: Database["public"]['Enums']["violation_kind"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_violations_conversation_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_violations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"date_of_birth": string | null,"deleted_at": string | null,"email": string | null,"id": string,"intent": Database["public"]['Enums']["user_intent"] | null,"last_seen_at": string | null,"onboarding_completed_at": string | null,"phone": string | null,"phone_verified_at": string | null,"status": Database["public"]['Enums']["account_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"id": string,"intent"?: Database["public"]['Enums']["user_intent"] | null,"last_seen_at"?: string | null,"onboarding_completed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"id"?: string,"intent"?: Database["public"]['Enums']["user_intent"] | null,"last_seen_at"?: string | null,"onboarding_completed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"verification_records": {
                  Row: {
                    "created_at": string,"document_path": string,"id": string,"kind": Database["public"]['Enums']["verification_kind"],"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["verification_status"],"subject_id": string,"subject_type": string,"submitted_by": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_path": string,"id"?: string,"kind": Database["public"]['Enums']["verification_kind"],"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"subject_id": string,"subject_type": string,"submitted_by": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"document_path"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["verification_kind"],"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"subject_id"?: string,"subject_type"?: string,"submitted_by"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "verification_records_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "verification_records_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "property_owner_cards": {
                  Row: {
                    "display_name": string | null,"member_since": string,"owner_type": Database["public"]['Enums']["owner_type"],"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "property_owners_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"public_user_cards": {
                  Row: {
                    "avatar_path": string | null,"display_name": string,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "user_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_review_property":
{ Args: { "p_approve": boolean,"p_property_id": string,"p_reason"?: string }; Returns: undefined
                           },
"audit":
{ Args: { "p_action": string,"p_details"?: Json,"p_entity_id"?: string,"p_entity_type": string }; Returns: string
                           } |
{ Args: { "p_action": string,"p_details"?: Json,"p_entity_id": string,"p_entity_type": string }; Returns: string
                           },
"become_owner":
{ Args: { "p_business_name"?: string,"p_contact_email"?: string,"p_contact_phone": string,"p_owner_type": Database["public"]['Enums']["owner_type"],"p_whatsapp_number"?: string }; Returns: undefined
                           },
"block_user":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"booking_payable_amount":
{ Args: { "p_booking_id": string }; Returns: number
                           },
"can_access_conversation_topic":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"cancel_booking":
{ Args: { "p_booking_id": string,"p_reason"?: string }; Returns: undefined
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"clean_display_name":
{ Args: { "p_raw": string }; Returns: string
                           },
"confirm_booking_payment":
{ Args: { "p_amount_paise": number,"p_order_id": string,"p_payment_id": string }; Returns: string
                           },
"confirm_listing":
{ Args: { "p_property_id": string }; Returns: undefined
                           },
"consume_rate_limit":
{ Args: { "p_action": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_property_inquiry":
{ Args: { "p_message": string,"p_move_in_date"?: string,"p_occupants"?: number,"p_property_id": string,"p_room_id"?: string }; Returns: string
                           },
"detect_contact_info":
{ Args: { "p_body": string }; Returns: Json
                           },
"expire_stale_bookings":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"fail_payment":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"has_active_restriction":
{ Args: { "p_kind": Database["public"]['Enums']["restriction_kind"] }; Returns: boolean
                           },
"has_role":
{ Args: { "p_role": Database["public"]['Enums']["user_role"] }; Returns: boolean
                           },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_blocked_pair":
{ Args: { "p_a": string,"p_b": string }; Returns: boolean
                           },
"is_conversation_member":
{ Args: { "p_conversation_id": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"listing_fresh_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"log_ai_usage":
{ Args: { "p_error_code"?: string,"p_feature": string,"p_input_tokens"?: number,"p_latency_ms"?: number,"p_model": string,"p_output_tokens"?: number,"p_provider": string,"p_status"?: string,"p_tool_calls"?: number }; Returns: string
                           },
"mark_conversation_read":
{ Args: { "p_conversation_id": string }; Returns: string
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"my_conversations":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: {
              "created_at": string,"id": string,"inquiry_id": string,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at": string,"last_message_preview": string,"last_read_at": string,"match_id": string,"muted": boolean,"my_role": string,"other_avatar_path": string,"other_display_name": string,"other_user_id": string,"property_id": string,"property_title": string,"status": Database["public"]['Enums']["conversation_status"],"unread_count": number
            }[]
                           },
"notify":
{ Args: { "p_body"?: string,"p_data"?: Json,"p_link_path"?: string,"p_title": string,"p_type": Database["public"]['Enums']["notification_type"],"p_user_id": string }; Returns: string
                           },
"owned_property_for_update":
{ Args: { "p_property_id": string }; Returns: {
              "address_line": string | null,
"amenity_codes": (string)[],
"approved_at": string | null,
"available_beds": number,
"city": string | null,
"cover_media_path": string | null,
"created_at": string,
"deleted_at": string | null,
"description": string | null,
"electricity_billing": Database["public"]['Enums']["utility_billing"] | null,
"electricity_monthly_estimate": number | null,
"food_available": boolean,
"food_included": boolean,
"food_monthly_charge": number | null,
"furnishing": Database["public"]['Enums']["furnishing"] | null,
"has_ac": boolean,
"has_attached_bathroom": boolean,
"id": string,
"landmark": string | null,
"last_confirmed_at": string | null,
"listing_mode": Database["public"]['Enums']["listing_mode"],
"locality": string | null,
"location": unknown,
"maintenance_monthly": number | null,
"max_rent": number | null,
"meals_breakfast": boolean,
"meals_dinner": boolean,
"meals_lunch": boolean,
"min_rent": number | null,
"monthly_rent": number | null,
"occupancy_options": (number)[],
"owner_id": string,
"pincode": string | null,
"property_type": Database["public"]['Enums']["property_type"],
"published_at": string | null,
"rating_avg": number | null,
"rating_count": number,
"rejection_reason": string | null,
"search_tsv": unknown,
"security_deposit": number | null,
"slug": string,
"state": string | null,
"status": Database["public"]['Enums']["listing_status"],
"submitted_at": string | null,
"tenant_gender": Database["public"]['Enums']["tenant_gender"],
"title": string,
"total_beds": number,
"updated_at": string,
"water_billing": Database["public"]['Enums']["utility_billing"] | null,
"water_monthly_estimate": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "properties"
        isOneToOne: true
        isSetofReturn: false
      } },
"owner_respond_booking":
{ Args: { "p_accept": boolean,"p_booking_id": string,"p_reason"?: string }; Returns: undefined
                           },
"owner_set_inquiry_status":
{ Args: { "p_inquiry_id": string,"p_status": Database["public"]['Enums']["inquiry_status"] }; Returns: undefined
                           },
"owner_set_listing_status":
{ Args: { "p_property_id": string,"p_status": Database["public"]['Enums']["listing_status"] }; Returns: undefined
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_payment_order":
{ Args: { "p_amount_paise": number,"p_booking_id": string,"p_order_id": string }; Returns: undefined
                           },
"refresh_property_search_fields":
{ Args: { "p_property_id": string }; Returns: undefined
                           },
"report_message":
{ Args: { "p_details"?: string,"p_message_id": string,"p_reason": string }; Returns: string
                           },
"request_booking":
{ Args: { "p_bed_id"?: string,"p_move_in_date": string,"p_note"?: string,"p_property_id": string,"p_stay_months": number }; Returns: string
                           },
"reveal_owner_contact":
{ Args: { "p_property_id": string }; Returns: {
              "contact_phone": string,"display_name": string,"whatsapp_number": string
            }[]
                           },
"roommate_can_view":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"roommate_candidates":
{ Args: { "p_limit"?: number }; Returns: Json[]
                           },
"roommate_card":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"roommate_profile_cards":
{ Args: { "p_user_ids": (string)[] }; Returns: Json[]
                           },
"roommate_swipe":
{ Args: { "p_action": Database["public"]['Enums']["swipe_action"],"p_target": string }; Returns: Json
                           },
"roommate_unmatch":
{ Args: { "p_match_id": string }; Returns: undefined
                           },
"search_properties":
{ Args: { "p_amenities"?: (string)[],"p_available_only"?: boolean,"p_budget_max"?: number,"p_budget_min"?: number,"p_city"?: string,"p_food"?: boolean,"p_furnishing"?: Database["public"]['Enums']["furnishing"],"p_gender"?: Database["public"]['Enums']["tenant_gender"],"p_lat"?: number,"p_limit"?: number,"p_lng"?: number,"p_offset"?: number,"p_q"?: string,"p_radius_m"?: number,"p_sort"?: string,"p_types"?: (Database["public"]['Enums']["property_type"])[] }; Returns: {
              "amenity_codes": (string)[],"available_beds": number,"city": string,"cover_media_path": string,"distance_m": number,"food_available": boolean,"furnishing": Database["public"]['Enums']["furnishing"],"id": string,"last_confirmed_at": string,"lat": number,"listing_mode": Database["public"]['Enums']["listing_mode"],"lng": number,"locality": string,"price_from": number,"property_type": Database["public"]['Enums']["property_type"],"rating_avg": number,"rating_count": number,"slug": string,"tenant_gender": Database["public"]['Enums']["tenant_gender"],"title": string,"total_beds": number,"total_count": number
            }[]
                           },
"send_message":
{ Args: { "p_attachment"?: Json,"p_body": string,"p_conversation_id": string }; Returns: Json
                           },
"setting_int":
{ Args: { "p_fallback": number,"p_key": string }; Returns: number
                           },
"shares_conversation_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"slugify":
{ Args: { "p_text": string }; Returns: string
                           },
"start_inquiry_conversation":
{ Args: { "p_inquiry_id": string }; Returns: string
                           },
"submit_appeal":
{ Args: { "p_moderation_action_id": string,"p_statement": string }; Returns: string
                           },
"submit_contact_message":
{ Args: { "p_email": string,"p_message": string,"p_name": string,"p_phone": string,"p_subject": string }; Returns: string
                           },
"submit_property_for_review":
{ Args: { "p_property_id": string }; Returns: (string)[]
                           },
"submit_report":
{ Args: { "p_details"?: string,"p_reason_code": string,"p_target_id": string,"p_target_type": Database["public"]['Enums']["report_target"] }; Returns: string
                           },
"unblock_user":
{ Args: { "p_user_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "active"|"restricted"|"suspended"|"deleted","appeal_status": "pending"|"upheld"|"overturned","availability_status": "available"|"limited"|"fully_occupied"|"coming_soon"|"unavailable","bed_status": "available"|"reserved"|"occupied"|"blocked","booking_amount_kind": "security_deposit"|"first_month_rent","booking_status": "requested"|"accepted"|"confirmed"|"declined"|"expired"|"cancelled","charge_frequency": "monthly"|"one_time"|"yearly","conversation_kind": "roommate_match"|"property_inquiry","conversation_status": "active"|"closed","furnishing": "unfurnished"|"semi_furnished"|"fully_furnished","gender": "male"|"female"|"non_binary"|"prefer_not_to_say","inquiry_status": "new"|"responded"|"closed"|"spam","listing_mode": "per_bed"|"entire_unit","listing_status": "draft"|"pending_review"|"published"|"paused"|"rejected"|"archived","match_status": "active"|"unmatched"|"blocked","media_kind": "image"|"video","message_kind": "text"|"image"|"system","message_moderation": "clean"|"flagged"|"blocked","moderation_action_kind": "warning"|"restrict"|"suspend"|"unsuspend"|"lift_restriction"|"content_removed","notification_type": "system"|"new_message"|"roommate_match"|"inquiry_received"|"inquiry_responded"|"listing_submitted"|"listing_approved"|"listing_rejected"|"listing_stale"|"verification_approved"|"verification_rejected"|"review_received"|"review_reply"|"contact_warning"|"moderation_warning"|"restriction_applied"|"restriction_lifted"|"account_suspended"|"account_reinstated"|"report_resolved"|"appeal_decided","occupation_type": "student"|"working_professional"|"other","owner_type": "individual"|"pg_operator"|"agent"|"company","payment_status": "created"|"paid"|"failed"|"refunded","place_kind": "college"|"university"|"office"|"tech_park"|"metro_station"|"railway_station"|"airport"|"bus_stop"|"hospital"|"pharmacy"|"restaurant"|"cafe"|"grocery"|"shopping_centre"|"gym","property_type": "pg"|"boys_pg"|"girls_pg"|"hostel"|"co_living"|"private_room"|"shared_room"|"studio"|"one_bhk"|"two_bhk"|"three_bhk"|"independent_house","property_verification_kind": "authorisation"|"listing_confirmation"|"site_visit","report_status": "open"|"in_review"|"resolved"|"dismissed","report_target": "user"|"property"|"roommate_profile"|"review"|"message","restriction_kind": "messaging"|"matching"|"listing"|"all","review_status": "published"|"hidden"|"removed","room_type": "private"|"shared","roommate_profile_status": "draft"|"active"|"paused","swipe_action": "like"|"pass","tenant_gender": "any"|"male"|"female","user_intent": "find_home"|"find_roommate"|"have_place_need_roommate"|"list_property","user_role": "seeker"|"owner"|"moderator"|"admin","utility_billing": "included"|"fixed"|"metered","verification_kind": "government_id"|"ownership_proof"|"authorisation_letter"|"utility_bill"|"business_registration","verification_status": "unverified"|"pending"|"verified"|"rejected"|"expired","violation_kind": "contact_sharing"|"harassment"|"spam"|"other","work_schedule": "day"|"night"|"flexible"|"remote"|"irregular"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_status": ["active", "restricted", "suspended", "deleted"],"appeal_status": ["pending", "upheld", "overturned"],"availability_status": ["available", "limited", "fully_occupied", "coming_soon", "unavailable"],"bed_status": ["available", "reserved", "occupied", "blocked"],"booking_amount_kind": ["security_deposit", "first_month_rent"],"booking_status": ["requested", "accepted", "confirmed", "declined", "expired", "cancelled"],"charge_frequency": ["monthly", "one_time", "yearly"],"conversation_kind": ["roommate_match", "property_inquiry"],"conversation_status": ["active", "closed"],"furnishing": ["unfurnished", "semi_furnished", "fully_furnished"],"gender": ["male", "female", "non_binary", "prefer_not_to_say"],"inquiry_status": ["new", "responded", "closed", "spam"],"listing_mode": ["per_bed", "entire_unit"],"listing_status": ["draft", "pending_review", "published", "paused", "rejected", "archived"],"match_status": ["active", "unmatched", "blocked"],"media_kind": ["image", "video"],"message_kind": ["text", "image", "system"],"message_moderation": ["clean", "flagged", "blocked"],"moderation_action_kind": ["warning", "restrict", "suspend", "unsuspend", "lift_restriction", "content_removed"],"notification_type": ["system", "new_message", "roommate_match", "inquiry_received", "inquiry_responded", "listing_submitted", "listing_approved", "listing_rejected", "listing_stale", "verification_approved", "verification_rejected", "review_received", "review_reply", "contact_warning", "moderation_warning", "restriction_applied", "restriction_lifted", "account_suspended", "account_reinstated", "report_resolved", "appeal_decided"],"occupation_type": ["student", "working_professional", "other"],"owner_type": ["individual", "pg_operator", "agent", "company"],"payment_status": ["created", "paid", "failed", "refunded"],"place_kind": ["college", "university", "office", "tech_park", "metro_station", "railway_station", "airport", "bus_stop", "hospital", "pharmacy", "restaurant", "cafe", "grocery", "shopping_centre", "gym"],"property_type": ["pg", "boys_pg", "girls_pg", "hostel", "co_living", "private_room", "shared_room", "studio", "one_bhk", "two_bhk", "three_bhk", "independent_house"],"property_verification_kind": ["authorisation", "listing_confirmation", "site_visit"],"report_status": ["open", "in_review", "resolved", "dismissed"],"report_target": ["user", "property", "roommate_profile", "review", "message"],"restriction_kind": ["messaging", "matching", "listing", "all"],"review_status": ["published", "hidden", "removed"],"room_type": ["private", "shared"],"roommate_profile_status": ["draft", "active", "paused"],"swipe_action": ["like", "pass"],"tenant_gender": ["any", "male", "female"],"user_intent": ["find_home", "find_roommate", "have_place_need_roommate", "list_property"],"user_role": ["seeker", "owner", "moderator", "admin"],"utility_billing": ["included", "fixed", "metered"],"verification_kind": ["government_id", "ownership_proof", "authorisation_letter", "utility_bill", "business_registration"],"verification_status": ["unverified", "pending", "verified", "rejected", "expired"],"violation_kind": ["contact_sharing", "harassment", "spam", "other"],"work_schedule": ["day", "night", "flexible", "remote", "irregular"]
          }
        }
} as const
