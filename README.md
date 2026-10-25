# GuildCore — RF Online NEXT Guild Tracker

A deployable React + Supabase web application for tracking an RF Online NEXT guild roster. Includes multi-guild workspaces, officer permissions, Combat Power rankings, CP history, events, CSV export, and a Discord webhook Edge Function.

> Unofficial community tool. Not affiliated with RF Online NEXT or its publisher. The app does not read game data automatically; authorized users enter roster information manually.

## Included features

- Email/password authentication through Supabase Auth.
- Multiple guild/alliance workspaces per account.
- Roles: `owner`, `admin`, `officer`, `member`.
- Shared roster with IGN, class, faction, CP and notes.
- Leaderboard sorted by current CP.
- Automatic CP history snapshots when a member is added or their CP changes.
- Guild events for PvP, war, raids, Core World and meetings.
- CSV roster export.
- Guild settings and account access management.
- Optional Discord webhook integration through a Supabase Edge Function.
- Row Level Security (RLS) policies for guild-level access boundaries.

## Stack

- React + Vite
- Supabase Auth + Postgres + Row Level Security
- Supabase Edge Functions (Deno) for Discord webhook calls
- Vercel-compatible static hosting

## 1. Create a Supabase project

1. Create a project at https://supabase.com.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `supabase/migrations/0001_guildcore.sql`.
4. In **Project Settings → API**, copy the Project URL and `anon`/publishable key.
5. Under **Authentication → URL Configuration**, set the Site URL to your deployed website. Add your local URL (`http://localhost:5173`) and deployed URL to Redirect URLs if needed.
6. If you want sign-up without email confirmation for a private test, change the email confirmation setting in Supabase Auth. For production, keep appropriate verification enabled.

## 2. Configure and run locally

Install Node.js 20 or later, then:

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Use only the anon/publishable key in `VITE_` browser variables. **Never put a Supabase service-role key in frontend code or a VITE variable.**

Then run:

```bash
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## 3. Deploy the website online

### Vercel

1. Push this folder to a private GitHub repository.
2. In Vercel, import the repository.
3. Set build command to `npm run build` and output directory to `dist` (Vercel normally detects Vite).
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Project Settings → Environment Variables.
5. Deploy, then add your deployed URL to Supabase Auth URL Configuration.

The included `vercel.json` enables SPA route fallback. Netlify or Cloudflare Pages can also host the static Vite build; use `dist` as the output directory.

## 4. Create your first guild

1. Open the deployed site and create an account.
2. Sign in, then choose **Create guild**.
3. The creator becomes the `owner`.
4. Add roster members. The dashboard, rankings and CP history will populate automatically.
5. To share the roster, the other person creates their own GuildCore account first. In **Guild settings → Officer access**, enter their account email and choose a role.

Role capabilities:
- **Owner/Admin:** guild profile, grant access, configure Discord integration, roster, CP and events.
- **Officer:** roster, CP and event management.
- **Member:** read-only roster, rankings, CP history and events.

## 5. Configure Discord announcements (optional)

Discord webhook URLs are secret. The client UI intentionally does not read webhook URLs back from the database. Paste a webhook URL in the settings modal to save it; only owners/admins may do this. The webhook is used by the Edge Function and is not exposed to roster viewers.

Install the Supabase CLI and link your project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy discord-notify
```

The function uses the project's server-side `SUPABASE_SERVICE_ROLE_KEY` secret automatically in a standard Supabase Edge Function environment. If your environment requires explicit secrets, set them using the Supabase dashboard/CLI; never add them to `.env` or commit them.

The app's **Send test announcement** action invokes the deployed `discord-notify` function. Only owners/admins can send a message.

### Discord webhook creation

In Discord, open the target channel's settings → Integrations → Webhooks → New Webhook. Copy its webhook URL into GuildCore. Treat that URL like a password and regenerate it if it leaks.

## Database and security notes

- RLS is enabled on every application table.
- Roster/event/CP writes are gated by guild role.
- Members can only read guilds where they have membership.
- The `guild_integrations` table has no authenticated SELECT policy, so browser clients cannot read stored webhook URLs. The Edge Function uses a server-side service key after checking the caller's role.
- The SQL `create_guild` RPC creates the guild and owner membership atomically. The client currently uses the standard flow for guild creation; if your deployment uses stricter policies, update `createGuild` in `src/App.jsx` to call `supabase.rpc('create_guild', {guild_name: ..., guild_server: ..., guild_region: ...})`. (Recommended production adjustment.)
- A user must already have a GuildCore account before an owner can grant membership by email.
- For a production guild tool, review the migration and policies with your database administrator before using real account information.

## Current limitations / recommended next improvements

- No automatic import from RF Online NEXT game servers or character API; data is manually maintained.
- CP activity chart currently visualizes the count of CP snapshots per date, not a true CP-over-time line chart.
- Attendance check-in and event RSVP are not included in this first online release.
- Discord announcements currently support a test message; event reminders and automatic announcements can be added next.
- The access list UI shows the current user's membership plus membership IDs, not other users' emails. A future admin-only database view/RPC could expose display names more cleanly.
- Email-based member invitations require the recipient to register first.
