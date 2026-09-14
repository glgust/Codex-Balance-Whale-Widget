---
name: codex-whale-widget
description: Query Codex subscription usage or show, hide, refresh and close the original Whale Widget adapted for Codex.
---

Use this plugin's get_usage to query official subscription windows and account token activity.
Use show_whale, close_whale, refresh_whale and desktop_status for its independent desktop companion.
The companion reuses MeteorNOX's original Whale Widget imagery and interactions. It does not need DSH.
Only claim the desktop is open if the tool confirms its running status.
Read window durations from the response. Null means unavailable, not zero.
Subscription percentage is not remaining tokens or API currency. Daily buckets retain server dates.
Do not access credentials, request model turns or redeem reset credits to refresh quota.
