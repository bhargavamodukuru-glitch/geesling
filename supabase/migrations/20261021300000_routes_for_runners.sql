-- Routes can be runs: "I want to run a 15k" plans a running route of about that distance.
alter table public.walks
  add column if not exists activity text not null default 'walk' check (activity in ('walk', 'run')),
  add column if not exists run_target_km numeric check (run_target_km is null or run_target_km between 1 and 50),
  add column if not exists run_pace_min_per_km numeric check (run_pace_min_per_km is null or run_pace_min_per_km between 2.5 and 12);
