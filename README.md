# Siniloan Enterprise Data Management

Next.js application backed by Supabase. It is ready to deploy on Vercel after the Supabase project has been provisioned and the repository is pushed to GitHub.

## Deploy the database

1. Create a new Supabase project in the Supabase dashboard.
2. Install and sign in to the Supabase CLI, then link this repository to the new project:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   This applies every versioned migration in `supabase/migrations`. Do not run `supabase db reset` against production.

3. Seed or create the first administrator account. The development seed data is intentionally not applied by `db push`; review `supabase/seed.sql` before using any portion of it in production.
4. In Supabase Authentication settings, set the Site URL to your eventual Vercel production URL. Add that URL and preview URLs you intend to use to the Redirect URLs allow-list.

## Deploy the app on Vercel

1. Push this repository to GitHub, then import it in Vercel. Keep the detected Next.js settings: build command `npm run build` and install command `npm ci`.
2. In Vercel Project Settings → Environment Variables, add these values for **Production** (and Preview if you use preview deployments):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL, e.g. `https://YOUR_PROJECT_REF.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable/anon key from Supabase Connect |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service-role key from Supabase Connect. Keep this server-only and never expose it in client code. |

3. Deploy. Vercel builds `NEXT_PUBLIC_` values into the browser bundle, so redeploy whenever either public Supabase value changes.

## Local development

Copy `.env.example` to `.env.local` and use local Supabase credentials. The local browser client is proxied through Next.js; production connects directly to hosted Supabase.

```bash
npm ci
npm run db:start
npm run dev
```

## Pre-deployment checks

```bash
npm run lint
npm run build
```

The `.env*` files are ignored by Git except `.env.example`. Never commit production keys.
