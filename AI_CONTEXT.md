# AI Context - WanderLust (Splitwise Clone)

This file maintains the running context, architecture, design decisions, and status of the project.

---

## 1. Product Understanding & Scope
WanderLust is a production-quality, Splitwise-inspired expense splitting web application designed for portfolios and technical interviews. It demonstrates modern web architecture, clean code (SOLID principles), robust edge-case handling (e.g., floating-point rounding), and advanced features (real-time chat, debt simplification).

*   **Status**: Phase 1 to 7 Complete - Developed, tested, and ready for deployment.
*   **Key Users**: Friends, roommates, and travel groups who need to track shared expenses and settle up debts cleanly.

### Implemented Feature Set
1.  **Authentication & User Profiles**: Secure credentials-based login, registration, and user avatars (via Dicebear).
2.  **Group Management**: Creating groups, inviting members via email searches, listing memberships.
3.  **Expense Management**: Recording expenses with multiple split methods (equal, unequal, percentage, shares).
4.  **Debt Settlement**: Recording payment offsets, direct settlements, and calculating simplified debts.
5.  **Real-Time Collaboration**: Websocket room chat per expense to discuss details.
6.  **Analytics & Dashboard**: Recharts spending category breakdown and overall balance card metrics (Total, Owed, Owe).

---

## 2. Tech Stack
*   **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide Icons, Recharts (for analytics).
*   **Backend / API**: Next.js API Routes (Server-side handlers).
*   **Database**: PostgreSQL with Prisma ORM v7 (utilizing the new driver adapter pattern via `pg` and `@prisma/adapter-pg`).
*   **Authentication**: NextAuth.js (Credentials Provider).
*   **Real-time API**: Socket.io (integrated via custom Node.js/Express HTTP server wrapper).
*   **Validation**: Zod for compile-time and run-time validation schema.
*   **Testing**: Vitest.

---

## 3. Architecture & Design Patterns
*   **Custom Server**: We implemented `server.ts` combining Express, Socket.io, and the Next.js compiler. This allows us to serve Next.js pages and maintain long-lived WebSocket connections using a single unified application thread, bypassing serverless WebSocket limitations.
*   **State Management**: React state hooks, React Refs, and NextAuth session states.
*   **Database Schema**: Designed with strict referential integrity, indexes on frequently queried fields, and cascade deletions.
*   **SOLID Principles**: Decoupled service layer in `src/lib/simplify.ts` separating split math calculations and the debt graph simplification algorithm from database access and API handlers.

---

## 4. Changelog & Implementation History
*   **2026-06-13**: Initialized repository structure.
*   **2026-06-13**: Configured Prisma schema (`schema.prisma`) and instantiated database client (`src/lib/prisma.ts`) under the new Prisma 7 adapter standard.
*   **2026-06-13**: Programmed calculations and debt simplification engines in `src/lib/simplify.ts`.
*   **2026-06-13**: Wrote 8 unit tests in `src/lib/__tests__/simplify.test.ts` and verified with Vitest (100% pass).
*   **2026-06-13**: Configured NextAuth credentials handler and register endpoint `/api/auth/register`.
*   **2026-06-13**: Developed groups, expenses, settlements, chats, and user search backend API routes.
*   **2026-06-13**: Coded unified custom HTTP + WebSockets server in `server.ts`.
*   **2026-06-13**: Designed premium dark-slate frontend layout files, dashboards, detail views, and real-time chat drawers.
*   **2026-06-13**: Compiled project README and completion walkthrough artifacts.
