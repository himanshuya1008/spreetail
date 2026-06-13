# Build Plan - WanderLust (Splitwise Clone)

This document outlines the detailed build plan, architectural decisions, database schemas, and folder structures for the WanderLust expense sharing web application.

---

## 1. Core Workflows
We will implement the following core workflows:

1.  **User Authentication & Registration**
    *   Sign Up / Sign In using NextAuth.js (Credentials-based with secure password hashing via `bcryptjs`).
    *   User Session tracking in React Context / NextAuth hooks.
2.  **Group Management**
    *   Create group (Name, Description, Icon).
    *   Invite members (by searching active users in the system or sharing a group invite link).
    *   Remove group members and delete/edit groups (accessible to creator).
3.  **Expense Management & Splitting**
    *   Add Expense (Description, Amount, Date, Category, Payer, Participants, Split Method).
    *   Split Methods:
        *   *Equal*: Divides amount equally among all selected members (handling cents rounding).
        *   *Unequal*: Explicit dollar amounts per member.
        *   *Percentage*: Explicit percentages (validated to sum to 100%).
        *   *Shares*: Proportional split based on assigned shares.
    *   Edit/Delete Expenses (updates the balances of all participants dynamically).
4.  **Balance Calculation & Debt Simplification**
    *   Maintain active balance tables for efficiency, or construct a dynamic directed graph of debts from transaction/expense history.
    *   **Debt Simplification Algorithm**: Implement a greedy min-heap/max-heap algorithm that reduces transitive debts.
        *   *Example*: If A owes B $10 and B owes C $10, simplify to: A owes C $10.
5.  **Settlements & Payments**
    *   Record a settlement payment between two group members (e.g., "A paid B $10").
    *   Display direct balance status (e.g., "You are owed $20" or "You owe $15").
6.  **Real-Time Expense Chat**
    *   Embedded chat board inside each Group and Expense view.
    *   Using WebSockets (via Socket.io bound to a custom Next.js server) for instant message broadcasts.
7.  **Dashboard & Visual Analytics**
    *   Interactive dashboard showing total balance, net positive/negative state.
    *   Recharts bar/pie charts illustrating spending breakdown by category and monthly trends.

---

## 2. Architecture Decisions
*   **Next.js App Router**: Utilizing Server Components for fast initial page load and Client Components for interactive forms.
*   **Custom Next.js Server**: We will write a custom `server.ts` that boots the Next.js production compiler and instantiates a Socket.io server on the same HTTP port. This avoids separate API server setups and keeps the codebase simple, zero-cost, and robust.
*   **Database & ORM**: PostgreSQL with Prisma. We will run Prisma migrations and write a database seed script (`prisma/seed.ts`) to populate mock users, groups, and expenses.
*   **Validation**: Inputs to Next.js API endpoints will be validated using Zod.
*   **Aesthetics & UI**: shadcn/ui components (Radix primitives) combined with Tailwind CSS v4 to achieve premium visual quality, dark mode, smooth transitions, and a clean mobile-first layout.

---

## 3. Folder Structure
We will adopt the following project layout:

```text
sprretail/
├── prisma/
│   ├── schema.prisma      # Prisma schema for PostgreSQL
│   └── seed.ts            # Seed data script
├── src/
│   ├── app/
│   │   ├── api/           # Next.js API Routes (Auth, Groups, Expenses, etc.)
│   │   ├── layout.tsx     # Root layout with fonts, provider contexts
│   │   ├── page.tsx       # Landing page / Landing dashboard
│   │   ├── dashboard/     # User main dashboard
│   │   └── groups/        # Group detail pages
│   ├── components/
│   │   ├── ui/            # shadcn/ui primitive components
│   │   ├── dashboard/     # Dashboard layouts and charts
│   │   ├── groups/        # Group forms, list, member invites
│   │   ├── expenses/      # Expense list, split forms, calculations
│   │   └── chat/          # Chat messages and Socket.io client logic
│   ├── hooks/
│   │   ├── use-socket.ts  # WebSockets hooks for Socket.io integration
│   │   └── use-toast.ts   # UI Toast notifications
│   ├── lib/
│   │   ├── prisma.ts      # Prisma client singleton
│   │   ├── simplify.ts    # Debt simplification algorithm
│   │   └── utils.ts       # Tailored color helper functions
│   └── types/
│       └── index.ts       # Shared TypeScript types
├── server.ts              # Custom server file linking Next.js + Socket.io
├── tsconfig.json          # TS config
└── package.json           # Node configuration
```

---

## 4. Database Schema
We will create these entities in our Prisma schema:

```prisma
// User profile and authentication
model User {
  id            String          @id @default(uuid())
  name          String
  email         String          @unique
  passwordHash  String
  avatarUrl     String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  memberships   GroupMember[]
  createdGroups Group[]         @relation("GroupCreator")
  paidExpenses  ExpenseSplit[]  @relation("SplitPaid")
  owedExpenses  ExpenseSplit[]  @relation("SplitOwed")
  createdExpenses Expense[]     @relation("ExpenseCreator")
  sentSettlements Settlement[]  @relation("SettlementSender")
  receivedSettlements Settlement[] @relation("SettlementReceiver")
  chatMessages  ChatMessage[]
}

// Group structures
model Group {
  id          String        @id @default(uuid())
  name        String
  description String?
  avatarUrl   String?
  createdById String
  creator     User          @relation("GroupCreator", fields: [createdById], references: [id])
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  members     GroupMember[]
  expenses    Expense[]
  settlements Settlement[]
  messages    ChatMessage[]
}

model GroupMember {
  id        String   @id @default(uuid())
  groupId   String
  userId    String
  joinedAt  DateTime @default(now())
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
}

// Expenses & splits
model Expense {
  id          String         @id @default(uuid())
  description String
  amount      Float          // Double precision for dollar values
  date        DateTime       @default(now())
  category    String         @default("General")
  createdById String
  creator     User           @relation("ExpenseCreator", fields: [createdById], references: [id])
  groupId     String
  group       Group          @relation(fields: [groupId], references: [id], onDelete: Cascade)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  splits      ExpenseSplit[]
  messages    ChatMessage[]
}

// Expense splits maps who paid what, and who owes what
model ExpenseSplit {
  id         String   @id @default(uuid())
  expenseId  String
  expense    Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation("SplitOwed", fields: [userId], references: [id], onDelete: Cascade)
  owedAmount Float    // What this user owes
  paidAmount Float    // What this user paid (supporting multiple payers)

  @@unique([expenseId, userId])
}

// Settlement transactions
model Settlement {
  id          String   @id @default(uuid())
  groupId     String
  group       Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  fromUserId  String
  fromUser    User     @relation("SettlementSender", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUserId    String
  toUser      User     @relation("SettlementReceiver", fields: [toUserId], references: [id], onDelete: Cascade)
  amount      Float
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
}

// Chats messages
model ChatMessage {
  id          String   @id @default(uuid())
  message     String
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  groupId     String
  group       Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  expenseId   String?
  expense     Expense? @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}
```

---

## 5. API Contracts
All responses will return standard JSON structures with proper HTTP status codes.

*   `POST /api/auth/register` - Create user. Request: `{ name, email, password }`
*   `GET /api/groups` - Get user groups.
*   `POST /api/groups` - Create group. Request: `{ name, description }`
*   `GET /api/groups/[id]` - Get group details, members, expenses, and calculated balances.
*   `POST /api/groups/[id]/members` - Invite member by email. Request: `{ email }`
*   `DELETE /api/groups/[id]/members/[memberId]` - Remove member.
*   `POST /api/expenses` - Create expense. Request: `{ description, amount, date, category, groupId, payerId, splitMethod, splits: [{ userId, owedAmount, paidAmount }] }`
*   `PUT /api/expenses/[id]` - Edit expense details and recalculate splits.
*   `DELETE /api/expenses/[id]` - Delete expense.
*   `POST /api/settlements` - Record a payment. Request: `{ groupId, fromUserId, toUserId, amount }`
*   `GET /api/groups/[id]/chats` - Fetch chat history for group.

---

## 6. Execution Steps (Roadmap)

### Step 1: Packages & Prisma Init
*   Install dependencies: `prisma`, `@prisma/client`, `next-auth`, `bcryptjs`, `@types/bcryptjs`, `zod`, `socket.io`, `socket.io-client`, `recharts`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `shadcn-ui`.
*   Initialize Prisma, create schema and migration configurations.

### Step 2: Custom Server Setup (`server.ts`)
*   Configure custom TypeScript HTTP server connecting Express, Socket.io, and Next.js renderer.
*   Update `package.json` dev/start commands to compile and run the custom server.

### Step 3: Auth & Database Seed
*   Set up Prisma client, migration, and seed file.
*   Implement NextAuth configuration for credentials login.
*   Build registration API and landing pages.

### Step 4: Core Logic (Splits & Simplification)
*   Write Split Calculation Utilities and Debt Simplification graph algorithms in `src/lib/simplify.ts`.
*   Write Vitest/Jest unit tests to verify decimal rounding correctness and simplification validity.

### Step 5: Groups & Expense Management APIs
*   Develop REST API endpoints for Groups, Group Members, Expenses, and Settlements.
*   Incorporate Zod validation for robust request filtering.

### Step 6: UI Design - Layout & Pages
*   Implement Tailwind theme settings, components, and layout files.
*   Build Dashboard UI displaying summary balances (you owe / you are owed) and Recharts metrics.
*   Build Group dashboard, expense creation dialog, settlement log drawer.

### Step 7: Real-Time Chat & Final Polish
*   Implement WebSockets connection hook and backend listeners.
*   Integrate instant expense discussion chat inside group sidebar.
*   Conduct edge-case validation, responsiveness check, and error boundaries setup.

---

## 7. Trade-offs and Simplifications
*   **Custom Next.js Server**: Next.js App Router works natively with the custom server, but Vercel hosting does not support long-lived WebSocket connections (since Vercel functions are serverless). For actual deployment, we would host the custom server on Render, Railway, or AWS EC2, or swap the WebSockets layer for Pusher. We will stick to the custom server to make the project 100% self-contained and run easily locally with a single command.
*   **Currency Support**: Default single currency (USD/$) for simplicity in balance offsets.
