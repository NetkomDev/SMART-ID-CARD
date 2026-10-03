begin;

-- Fix check constraint on card_print_events to allow 'CANCEL' action kind
alter table public.card_print_events drop constraint if exists card_print_events_kind_check;
alter table public.card_print_events add constraint card_print_events_kind_check check (kind in ('PRINTED', 'REPRINTED', 'RELEASED', 'CANCEL'));

commit;
