<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Qardix AI decisions
- Short PIN passwords are extended via `toInternalPassword()` before every auth call — auth requires 6+ chars.
- Roles live in `user_roles`; access status is enforced in RLS via `is_active_user()` — company/doctor deactivation must block data, not just UI.
- Marketing Managers read only `usage_events` + `company_doctors()` — never clinical tables.
- All ECG analysis goes through `analyzeEcg` server fn (mock now, `ECG_API_URL` later) — screens stay unchanged when the real model connects.
