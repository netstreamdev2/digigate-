# Migration 47: site licences and DigiGate technicians

Prepared locally on 13 November 2026. This document does not mean either Supabase project or Vercel has been updated.

Company administrators use **Add site** to request a licence. Requests appear in **Site licences**, with a waiting count on the security companies page. Super users open a request to prefill the site wizard; creating the site fulfils that request in the same transaction. A failed wizard leaves the request pending. Repeated sends reuse the pending request for that company and site name. Super users can close requests without creating a site. There is no email integration.

Super users appoint technicians from **People → Add a technician**, using a work email. Technician accounts belong to DigiGate, have no company or site assignment, require dashboard MFA, and choose a new password on first sign-in. Only super users can reset or deactivate a technician; technicians cannot manage their peers or super users.

## Permission audit

The historical SQL and dashboard `super_user` checks were reviewed by purpose. `is_super_user()` keeps its original meaning. `is_digigate_staff()` recognises active super users and technicians with MFA. Existing `can_manage_org` and `can_watch_org` checks now include technicians.

| Area | Technician access | Enforcement |
| --- | --- | --- |
| Companies, clients, sites, engagements, profiles | Read across every company, including suspended companies | RLS; `visible_site_ids`, `viewer_org`, `can_manage_org` |
| Checks, visits, alerts, photos, shifts | Same visibility and retention masking as a super user; can close alerts | Site visibility, viewer organisation, alert policies, photo RPCs, selfie function |
| People lists and counts, gate staff, guard records | Read globally; ordinary company administration | Four people board/count functions; shared function caller checks |
| Company boards, reports and audit log | Read globally; existing report tools | Company board, report board, daily totals, audit policy, `digigate-reports` caller checks |
| Handheld diagnostics | Full health, SIM, bundle, data and story; can set a plan | Six device functions and `set_device_plan` |
| Remote lock, restart and APK update | Allowed, with existing validation and audit | `request_device_command` and command history policy |
| New companies | Denied | Original organisation insert policy; server action; no button |
| New clients/sites, including legacy unfinished clients | Denied; company admins must request a licence too | Client/site insert policies and `create_site`; server action and wizard route |
| Company suspension and reinstatement | View status; denied changes | Original `set_company_suspended`; no controls for technicians; no direct column grants |
| Handheld release | Denied | Original `request_device_release`; no release button or direct column grants |
| Moving clients between companies | Retains the existing super-user-only restriction | Original `transfer_client` |
| Super-user/technician account administration | Super users appoint/manage technicians; super users remain outside account-management API | People function role and target checks; matching UI |
| PIN hashes, device tokens and service functions | Remain inaccessible | Existing column/function grants |
| Username migration | Technician uses real work email; the existing migration only changes plain company usernames | `scope_logins` unchanged |

Migration 47 rebinds the permission helper in an explicit allowlist of 16 existing functions, preserving their queries, validation, limits, masking and auditing. It checks that each signature and old helper exist and fails on drift. It does not replace the helper across the schema. Historical migrations remain unchanged. The database suite compares technician and super-user results across 22 reads and asserts the exact remaining list of super-user-only functions.

Dashboard navigation, company context/branding, setup/admin pages, company filters, search, people, reports, audit, expected visitors, hotlist and device pages use the shared staff helper for global access. Creation, licensing, suspension and release controls use the actual super-user role. `company-gate` lets DigiGate staff inspect suspended customers without admitting those customers.

## User-run release steps

Local validation: 320 core tests, 810 database/access checks and 26 report PDF/email checks pass; the two changed Edge Functions typecheck; the dashboard production build passes. ESLint has no errors and one existing unused-parameter warning in `app/login/actions.ts`. The new request and technician forms were checked in Chromium at 1440px and 390px, including inputs, Escape, viewport fit and reopening without old values. No forms or commands were submitted to external services during UI checks. The temporary preview route and its authentication bypass were removed after checking.

```powershell
pnpm test
pnpm test:db
pnpm dashboard typecheck
pnpm dashboard lint
pnpm dashboard build
pnpm test:reports
pnpm dlx deno check --config supabase/tests/deno.json supabase/functions/digigate-people/index.ts supabase/functions/digigate-reports/index.ts
```

The explicit Deno test configuration keeps dependencies in Deno's cache and stops it converting the pnpm workspace. Two existing type errors exposed by that check were fixed: the dynamic guard-record row now declares its allowed value types, and a PDF response owns its byte buffer. Their runtime behavior is unchanged.

Run from `C:\dev\digigate`. These commands write to external services and are for the user to run. Only the two project references below are permitted.

First apply and check on the test project:

```powershell
node supabase/setup/apply-migrations.mjs fgtuednylvrknqeyxizz
pnpm functions:bundle
pnpm dlx supabase functions deploy digigate-people digigate-reports --project-ref fgtuednylvrknqeyxizz --no-verify-jwt
```

Check with actual test-project logins: an admin requests a licence; super users see it and create its site; a technician sees every company, opens photos and reports, and uses remote control on a test handheld. The technician must have no company/site creation, suspension/reinstatement or release controls. Do not send commands to hospital handhelds for this check.

When ready, apply and deploy to production:

```powershell
node supabase/setup/apply-migrations.mjs agzlkzvipaoimsrkdaab
pnpm dlx supabase functions deploy digigate-people digigate-reports --project-ref agzlkzvipaoimsrkdaab --no-verify-jwt
```

Deploy a fresh dashboard preview from this source in `apps/dashboard` using the existing `digigate` Vercel project and `netstream-integrated-solutions` scope, then promote that fresh URL:

```powershell
vercel redeploy <fresh-preview-url> --target production --scope netstream-integrated-solutions
```

The earlier `digigate-1a9c9wx3f-netstream-integrated-solutions.vercel.app` preview predates these features. The new dashboard requires migration 47; apply the migration before serving it. The previous dashboard may still offer admins its old site wizard during the changeover, but the database will refuse creation. This release has no gate-app, native, APK or OTA changes. The already-deployed sync function needs no change.
