-- "What brings you to Toronto?" adds "Passing through" to the four existing answers.
alter table public.profiles drop constraint if exists profiles_persona_check;
alter table public.profiles add constraint profiles_persona_check
  check (persona in ('newcomer', 'tourist', 'student', 'passing', 'local'));
