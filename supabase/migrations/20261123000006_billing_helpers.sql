-- Invoice numbering helper (service role only).
create or replace function public.next_invoice_number() returns bigint
language sql volatile security definer set search_path = public as $$
  select nextval('public.invoice_number_seq');
$$;
revoke all on function public.next_invoice_number() from public, anon, authenticated;
