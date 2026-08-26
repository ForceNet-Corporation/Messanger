-- Создать один раз в Supabase SQL Editor.
-- Важно: текущий мессенджер использует Firebase Auth, поэтому Supabase не видит Firebase uid.
-- Политики ниже разрешают загрузку/чтение файлов в этом bucket через публичный клиентский ключ.
-- Не используйте здесь secret/service_role key в браузере.

insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do update set public = true;

drop policy if exists "chat files upload" on storage.objects;
drop policy if exists "chat files read" on storage.objects;
drop policy if exists "chat files delete" on storage.objects;

create policy "chat files upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'chat-files');

create policy "chat files read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'chat-files');

create policy "chat files delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'chat-files');
