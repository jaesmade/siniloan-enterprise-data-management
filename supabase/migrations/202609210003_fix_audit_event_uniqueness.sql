begin;

alter table core.audit_events
  drop constraint if exists audit_events_source_unique;

create unique index if not exists audit_events_source_event_unique
  on core.audit_events (source, source_event_id)
  where source_event_id is not null;

commit;
