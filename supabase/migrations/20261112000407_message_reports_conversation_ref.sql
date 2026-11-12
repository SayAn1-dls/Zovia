-- ZUVIO stage 4 / 07 — message_reports.conversation_id becomes a plain reference.
-- With both message_id and conversation_id as ON DELETE SET NULL foreign keys, purging a user
-- (users -> matches -> conversations -> messages) re-checked the conversation key after the
-- conversation was gone and the delete failed. The report keeps its own snapshot, so the
-- conversation id is kept for staff context only.
alter table public.message_reports drop constraint message_reports_conversation_id_fkey;
comment on column public.message_reports.conversation_id is 'Conversation the reported message was in (plain reference; the conversation may since have been deleted).';
