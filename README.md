# WanderLust - Shared Expense Splitting & Debt Simplification Dashboard

WanderLust is a production-grade, portfolio-ready web application inspired by Splitwise, built to showcase clean software engineering practices, advanced algorithm design, and modern web application architecture in technical interviews.

The application allows groups (roommates, travel buddies, coworkers) to split expenses under multiple methodologies, discuss bills in real time, and automatically resolve complex transitive debts using a greedy directed graph simplification engine.

---

## 🛠️ Technology Stack
*   **Framework**: Next.js 16 (App Router) with TypeScript
*   **Styling**: Tailwind CSS v4 & custom glassmorphism layers
*   **Database**: PostgreSQL
*   **ORM**: Prisma ORM v7 (utilizing the new driver adapter pattern)
*   **Authentication**: NextAuth.js (Secure Credentials authentication with bcryptjs hashing)
*   **Real-time**: Socket.io (integrated via custom Node.js/Express HTTP server wrapper)
*   **Validation**: Zod (schema verification on REST API request boundaries)
*   **Testing**: Vitest (for split calculations and debt simplification correctness)

---

## 📂 Folder Structure
Here is an overview of the key folders and files in this codebase:

```text
sprretail/
├── prisma/
│   ├── schema.prisma         # Database schema modeling relational structures
│   └── seed.ts               # Local seeding script to populate initial mock datasets
├── src/
│   ├── app/
│   │   ├── api/              # Secure Next.js API Routes (Auth, Groups, Expenses, Settlements)
│   │   ├── dashboard/        # Main balance and metrics overview route
│   │   ├── groups/[id]/      # Dynamic detailed group dashboards and chats
│   │   ├── login/            # Interactive credentials entry form
│   │   ├── register/         # User creation route
│   │   ├── globals.css       # Core stylesheets and visual variables (v4 syntax)
│   │   ├── layout.tsx        # Global HTML wrapper with fonts and providers
│   │   └── page.tsx          # Product landing index page
│   ├── components/
│   │   └── Providers.tsx     # Client context providers (NextAuth SessionProvider)
│   ├── hooks/
│   │   └── use-socket.ts     # Reactive hook to manage Socket.io connections
│   ├── lib/
│   │   ├── prisma.ts         # Singleton database client using pg pool & PrismaPg adapter
│   │   └── simplify.ts       # Core algorithms: Split calculations and Debt Simplifier
│   └── types/
│       └── next-auth.d.ts    # Session type augmentations for TypeScript
├── server.ts                 # Custom HTTP + WebSocket runtime server linking Express & Next.js
├── tsconfig.json             # TypeScript configuration options
├── package.json              # Script directives and npm dependencies
└── README.md                 # Project documentation
```

---

## ⚙️ Environment Setup & Installation

### 1. Prerequisites
Ensure you have **Node.js 20+** and a running **PostgreSQL** instance on your system.

### 2. Installation
Clone this workspace and run:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add the following keys:
```env
# Database Connection URL (PostgreSQL)
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<dbname>?schema=public"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your_very_long_secure_random_hash_string_here"
```

---

## 🗄️ Database Migrations & Seeding

1.  **Generate the local Prisma Client**:
    Since Prisma 7 requires explicit client generation and driver adapters, generate client types:
    ```bash
    npx prisma generate
    ```

2.  **Run migrations**:
    Apply database schema tables to your running PostgreSQL instance:
    ```bash
    npx prisma migrate dev --name init
    ```

3.  **Seed mock data**:
    Insert mock users, groups, shared splits, and settlements into the database for immediate testing:
    ```bash
    npx prisma db seed
    ```

---

## 🚀 Running the Application Locally

WanderLust is configured with a unified **custom server** (`server.ts`) that runs Next.js pages and instantiates the Socket.io WebSocket server on the same HTTP port. This prevents CORS conflicts and ensures real-time chatting functions out-of-the-box locally.

*   **Development Mode**:
    ```bash
    npm run dev
    ```
    This compiles and runs the custom server. The application will be accessible at [http://localhost:3000](http://localhost:3000).

*   **Testing Suites**:
    ```bash
    npm run test
    ```
    This runs our Vitest unit test suites verifying math algorithms and rounding offsets.

*   **Production Build**:
    ```bash
    npm run build
    npm run start
    ```

---

## 🎓 Interview Preparation Notes & Architectural QA

Be prepared to answer these questions during technical interviews or portfolio reviews:

### Q1: How does the Debt Simplification algorithm work?
**Answer**: WanderLust implements a **greedy graph reduction algorithm** in [simplify.ts](file:///c:/Users/himan/OneDrive/Desktop/sprretail/src/lib/simplify.ts).
1.  **Net Balances**: We first compile the net balance of every user (Total Paid - Total Owed).
2.  **Partitioning**: We split users into two arrays: `Debtors` (net balance < 0) and `Creditors` (net balance > 0).
3.  **Greedy Matching**: We sort both arrays in descending order of absolute values. We then match the largest debtor with the largest creditor, logging a direct settlement transaction.
4.  **Recurrence**: We subtract the settled amount from both users, remove anyone whose balance reaches $0, re-sort, and repeat.
This reduces the complexity of multi-party debt graphs from $O(N^2)$ transitive obligations to a maximum of $N - 1$ direct transactions.

### Q2: How do you handle decimal precision rounding issues (e.g. splitting $10.00 among 3 people)?
**Answer**: We convert all currencies to **integer cents** (e.g. multiplying amounts by 100 and rounding) during splitting calculations to avoid floating-point representation drift.
When dividing $1000$ cents among 3 people, a division remainder occurs: $1000 \pmod 3 = 1$. The base split is $333$ cents. The remainder cent is distributed to the first participant in the group. This ensures the sum of splits *always* exactly equals the total transaction amount, preventing rounding leakage in audits.

### Q3: Why use a custom Next.js server with Express and Socket.io?
**Answer**: Serverless Next.js API Routes (like Vercel functions) are stateless, short-lived executions that cannot maintain persistent TCP handshakes required for WebSockets.
By wrapping Next.js in a custom Node.js Express server, we bind a single Socket.io instance to the HTTP server. This allows us to serve Next.js pages and maintain long-lived WebSocket connections for real-time room chats using a single unified application thread, simplifying local developer workflows.

### Q4: How is security handled in database access and endpoints?
**Answer**:
*   **Session Guarding**: We use NextAuth's `getServerSession(authOptions)` on every API route boundary to authenticate callers.
*   **Membership Audits**: Before viewing details, writing expenses, or posting chat messages, the API verifies that the caller's `userId` matches a record in the `GroupMember` association table for that specific `groupId`.
*   **Input Sanitation**: We compile strict Zod schemas to validate, sanitize, and verify payloads on the incoming request boundaries.

---

## 🔮 Future Scalability Enhancements
1.  **Serverless WebSockets (Pusher/Supabase)**: Swap the custom Express Socket.io server for a hosted real-time provider (like Pusher or Supabase Realtime) if deploying strictly to a serverless platform (Vercel).
2.  **Multi-currency Support**: Integrate a daily exchange rate cron job and record currency tags on each expense, converting balances to user-preferred display units.
3.  **Receipt OCR Scanning**: Add a file upload bucket and utilize Google Cloud Vision / Tesseract OCR to automatically parse receipts, itemizing items for splits.
