# Advanced Pro Nano Backend

## Setup
1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env` and fill values.
3. Install dependencies:
   - `npm install`
4. Generate Prisma client:
   - `npx prisma generate`
5. Run migrations:
   - `npx prisma migrate deploy`
6. Seed admin + default settings:
   - `npm run seed`

## Run
- `npm run dev` for local development
- `npm start` for production

## Render settings (recommended)
- Root Directory: `backend`
- Build Command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run seed`
- Start Command: `npm start`
