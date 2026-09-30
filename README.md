# Military Asset Management System (MAMS)
Stack: React (Vite) · Node/Express · PostgreSQL · JWT.

## Run
1. `createdb mams && psql mams < backend/schema.sql`
2. Seed bases, equipment_types, and users (hash passwords with bcryptjs).
3. `cd backend && npm i && DATABASE_URL=postgres://... JWT_SECRET=... CORS_ORIGIN=http://localhost:5173 npm start`
4. `cd frontend && npm i && npm run dev`

## Balance definitions
- Net Movement = Purchases + Transfers In - Transfers Out
- Closing = Opening + Net Movement - Expended
- Assigned is reported separately; assigned items stay on the base's books until expended.

## RBAC matrix (enforced in middleware.js; non-admins are pinned to their own base)
| Feature         | Admin | Base Commander | Logistics Officer |
|-----------------|-------|----------------|-------------------|
| Dashboard       | all   | own base       | -                 |
| Purchases       | all   | -              | own base          |
| Transfers       | all   | own base       | own base          |
| Assign / Expend | all   | own base       | -                 |
| Audit log       | yes   | -              | -                 |
