-- Bucket pour les photos de profil bébé
-- Exécuter dans le SQL Editor Supabase

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Lecture publique
create policy "Avatars public read"
on storage.objects for select
using (bucket_id = 'avatars');

-- Upload / mise à jour par l'utilisateur connecté (dossier = user_id)
create policy "Users upload own avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users update own avatar"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users delete own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);
