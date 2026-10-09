-- The EXIT grant's absolute slack (D-213, Q-033 (c)): EventVaultV2 was redeployed so a keeper sale's floor is the fair
-- value less the wider of the tolerance share and a slack in bps of a whole token's payout. Null for a grant from the
-- retired v2, which had no slack.
alter table idx_vault_grants add column if not exists exit_slack_bps integer;
