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

## Data access

All server actions must be placed under /actions -folder. All db operations must be done in the server actions.
