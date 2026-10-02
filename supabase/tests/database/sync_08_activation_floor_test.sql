begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated'),
  ('a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated');

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"a2000000-0000-4000-8000-000000000001"}',
  true
);
select * from public.lifeos_sync_create_first_space(
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  repeat('11', 32), repeat('12', 32), repeat('13', 24), 'windows',
  encode(extensions.digest(decode(repeat('14', 32), 'hex'), 'sha256'), 'hex'),
  repeat('15', 32), repeat('16', 24)
);

insert into public.devices(
  device_id, space_id, supabase_auth_user_id, public_key,
  device_name_ciphertext, device_name_nonce, device_name_key_epoch, platform, status, activated_at, join_method
) values (
  'a4000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  decode(repeat('21', 32), 'hex'), decode(repeat('22', 32), 'hex'),
  decode(repeat('23', 24), 'hex'), 1, 'android', 'active', statement_timestamp(), 'pairing'
);

select * from public.lifeos_sync_advertise_data_format(
  'a4000000-0000-4000-8000-000000000001', 2::smallint
);
select throws_ok(
  $$select * from public.lifeos_sync_raise_data_format()$$,
  '42501', 'Data format promotion denied',
  'one active legacy device blocks format promotion'
);
update public.devices set status = 'revoked', revoked_at = statement_timestamp()
where device_id = 'a4000000-0000-4000-8000-000000000002';
select is(
  (select minimum_data_format from public.lifeos_sync_raise_data_format()),
  2::smallint,
  'revoked legacy devices do not block format promotion'
);

insert into public.devices(
  device_id, space_id, supabase_auth_user_id, public_key,
  device_name_ciphertext, device_name_nonce, platform, status, join_method
) values (
  'a4000000-0000-4000-8000-000000000003',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003',
  decode(repeat('31', 32), 'hex'), null, null, 'android', 'pending', 'pairing'
);
insert into public.key_envelopes(
  space_id, key_epoch, recipient_device_id, sender_device_id, encrypted_key, nonce
) values (
  'a3000000-0000-4000-8000-000000000001', 1,
  'a4000000-0000-4000-8000-000000000003',
  'a4000000-0000-4000-8000-000000000001',
  decode(repeat('32', 32), 'hex'), decode(repeat('33', 24), 'hex')
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',
  true
);
select throws_ok(
  $$select public.lifeos_sync_acknowledge_pairing(
    'a4000000-0000-4000-8000-000000000003',
    encode(extensions.digest(decode(repeat('32', 32) || repeat('33', 24), 'hex'), 'sha256'), 'hex'),
    repeat('34', 32), repeat('35', 24)
  )$$,
  '42501', 'Pending pairing device is required',
  'legacy pending pairing cannot activate after promotion'
);
select * from public.lifeos_sync_advertise_data_format(
  'a4000000-0000-4000-8000-000000000003', 2::smallint
);
select lives_ok(
  $$select public.lifeos_sync_acknowledge_pairing(
    'a4000000-0000-4000-8000-000000000003',
    encode(extensions.digest(decode(repeat('32', 32) || repeat('33', 24), 'hex'), 'sha256'), 'hex'),
    repeat('34', 32), repeat('35', 24)
  )$$,
  'an advertised pairing device can activate at the promoted floor'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"session_id":"a2000000-0000-4000-8000-000000000002"}',
  true
);
select * from public.lifeos_sync_begin_recovery(
  'a3000000-0000-4000-8000-000000000001', repeat('14', 32),
  'a4000000-0000-4000-8000-000000000004', repeat('41', 32), 'android'
);
select throws_ok(
  $$select public.lifeos_sync_complete_recovery(
    'a4000000-0000-4000-8000-000000000004', repeat('14', 32),
    encode(extensions.digest(decode(repeat('15', 32) || repeat('16', 24), 'hex'), 'sha256'), 'hex'),
    repeat('42', 32), repeat('43', 24)
  )$$,
  '42501', 'Pending recovery device is required',
  'legacy pending recovery cannot activate after promotion'
);
select * from public.lifeos_sync_advertise_data_format(
  'a4000000-0000-4000-8000-000000000004', 2::smallint
);
select lives_ok(
  $$select public.lifeos_sync_complete_recovery(
    'a4000000-0000-4000-8000-000000000004', repeat('14', 32),
    encode(extensions.digest(decode(repeat('15', 32) || repeat('16', 24), 'hex'), 'sha256'), 'hex'),
    repeat('42', 32), repeat('43', 24)
  )$$,
  'advertised recovery can activate at the promoted floor'
);

select * from public.lifeos_sync_begin_recovery(
  'a3000000-0000-4000-8000-000000000001', repeat('14', 32),
  'a4000000-0000-4000-8000-000000000004', repeat('44', 32), 'android'
);
select is(
  (select supported_data_format from public.devices
   where device_id = 'a4000000-0000-4000-8000-000000000004'),
  1::smallint,
  'retry with a new key resets the previous support declaration'
);
select throws_ok(
  $$select public.lifeos_sync_complete_recovery(
    'a4000000-0000-4000-8000-000000000004', repeat('14', 32),
    encode(extensions.digest(decode(repeat('15', 32) || repeat('16', 24), 'hex'), 'sha256'), 'hex'),
    repeat('42', 32), repeat('43', 24)
  )$$,
  '42501', 'Pending recovery device is required',
  'retry cannot reuse the old support declaration'
);

select * from finish();
rollback;
