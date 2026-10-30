# Hosted marketing preview

## Why it exists

One codebase builds two different sites:

- **Team App** (`app.elitelevelfundraising.com`, and QA `elf-team-qa`): built with `NEXT_PUBLIC_APP_URL` set, so `/` renders the app entry screen (Create / Join your team).
- **Marketing site** (`www.elitelevelfundraising.com`): built without it, so `/` renders the marketing homepage.

The QA Vercel project is a Team App build. Marketing pages such as `/fundraising` work there, but `/` and the marketing logo land on the app entry screen. QA has no marketing build, so the homepage can't be reviewed there.

## How it works

A marketing-only preview of a branch is deployed as a **preview** (non-production) deployment of the `elf-team-qa` project:

- **Isolated from QA's Team App:** it never touches the QA production alias, so the QA Team App is unchanged.
- **No secrets:** every QA environment variable targets *production* only, so a preview deployment receives none. There's no database, Stripe, email, Upstash or app mode. Forms can't write anywhere: the preview-lead endpoint answers 503, and the demo and partner forms fail safely.
- **Log in goes to the QA Team App:** the build-time flag `NEXT_PUBLIC_ELF_MARKETING_PREVIEW=qa` points "Log in" at the QA Team App instead of production (`src/lib/teamAppLogin.ts`).
- **Enforced by the deployment guard:** the guard refuses any build that sets the flag alongside a secret or app configuration (`src/lib/deploymentGuard.ts`), so production can't be flipped into preview mode.

Like every `*.vercel.app` deployment of this team, the preview sits behind Vercel authentication and isn't indexed.

## Deploy

```sh
git archive <commit> | tar -x -C <dir>      # clean export, no local .env files
cp <qa .vercel/project.json> <dir>/.vercel/  # elf-team-qa
cd <dir> && vercel deploy --yes --scope team_WGuvL9lm4lllGcw5BCYiZ9hQ \
  --build-env NEXT_PUBLIC_ELF_MARKETING_PREVIEW=qa --env NEXT_PUBLIC_ELF_MARKETING_PREVIEW=qa
```

The flag is needed at build time and at runtime, because the guard also runs at server startup. It is set per deployment only, never as a project environment variable. Never add `--prod`, which would replace the QA Team App (the guard also refuses the flag on a production deployment).

The guard accepts a QA-project deployment as a marketing preview only when the Vercel project/host identity is its sole QA signal and it carries no secrets. Real QA app configuration still gets the full QA checks.
