-- D-231: the theme agent leaves with the guarded stock pools — a theme is a `basket` strategy the house strategy-runner
-- calls through each follower's STRATEGY grant, so no per-follower key is issued or sealed any more. Its key store goes
-- (0001_theme_agent_keys.sql stays: the log is append-only). Testnet held "0 key(s) issued" when it was retired.
drop table if exists theme_agent_keys;
