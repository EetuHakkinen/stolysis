Always ask if anything is unclear. Do not assume anything.

## Db naming

All postgres tables and columns must be named with snakecase, for example `company_data`. In Prisma schema, these will be named with camelcase like `CompanyData` (columns with lowercase first letter `companyData`).

All db tables must have `createdAt` and `updatedAt`-columns.

## Components

When doing something that might be reusable, use components to make the features reusable and codebase less cluttered.

## UI components

We use shadcn components and Tailwind for styling.

## Authentication

All routes under /dashboard -route must be authenticated with Clerk. Make sure that all server actions are authenticated as well.

## Translations

UI must have both finnish and english version.

## Routes

Use a REST-style route structure: `/<area>/<resource>/<action-or-identifier>`, with the
resource name in singular. Unless advised otherwise, for example:

- `/dashboard/company/create` — create a company
- `/dashboard/company/{ticker}` — view a single company
- `/dashboard/company/{ticker}/edit` — edit a company

## Data access

All server actions must be placed under /actions -folder. No db operations must be done from the ui component code, place it instead to server actions (or util functions in lib in case it's general logic)

So all re-usable backend logic must be in /lib instead of actions.

Server actions take the values as typed parameters (for example `createCompany({ name, ticker })`), not `FormData`. Forms keep their values in state and call the action with them.

## Rendering (Cache Components)

`cacheComponents` is enabled. Anything that reads request-time data — cookies, headers,
the Clerk session (`auth()`), translations (`getTranslations`), or db reads via server
actions — must render inside a `<Suspense>` boundary, or Next.js reports a blocking-route error.

- Static pages under /dashboard are covered by `app/dashboard/loading.tsx`. New route segments
  outside /dashboard need their own `loading.tsx` (or a `<Suspense>` in the page).
- Dynamic segments (`[id]`, `[ticker]`, …) always need their own `loading.tsx`, also under
  /dashboard: a client navigation between two pages of the same dynamic route (e.g.
  `/dashboard/news/1` → `/dashboard/news/2`) only re-renders below the shared layout, so the
  `/dashboard` boundary doesn't cover it.
- Layouts must not await request-time data at the top level. Move it into a child
  component wrapped in `<Suspense>`, as in `app/dashboard/layout.tsx`.
- The root layout must stay static. Values that depend on cookies and affect `<html>`
  (`lang`, theme) are set with an inline script (`InlineScript`), not read on the server.
- Do not use `export const instant = false` to silence the error without asking.
