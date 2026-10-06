# ACM SIGGRAPH Hackathon Attendance (admin-only)

1. `cp .env.example .env.local` and set `NEXT_PUBLIC_API_URL` to your Antigravity backend URL (no trailing slash). No secrets go in the frontend.
2. `npm install && npm run dev` (http://localhost:3000). Production: `npm run build && npm start`, or deploy to Vercel with the same env var.
3. The backend must allow CORS from the frontend origin and enforce admin auth on every write.

## API contract assumed (edit src/lib/api.ts if yours differs)
POST /auth/login {email,password} -> {token, admin:{name,email}}  (Bearer token on all other calls)
GET /dashboard/stats?date -> {totalTeams,totalMembers,present,absent,percentage}
GET /teams?search -> Team[] ; GET /teams/:teamId?date -> {teamId,name,members:[{id,name,email,role,status,markedAt}]}
POST /teams, PUT/DELETE /teams/:teamId ; POST /teams/:teamId/members, PUT/DELETE /teams/:teamId/members/:id
POST /attendance {teamId,date,records:[{memberId,status}]} (server stamps time + admin)
GET /attendance?date&teamId&status -> [{date,teamId,teamName,memberId,memberName,role,status,markedAt}]
GET /attendance/export?date -> .xlsx (sheets: Attendance, Teams, Members, Summary)
