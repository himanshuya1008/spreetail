# AI_USAGE.md — AI Tools & Correction Log

This log documents the AI tools used during the development of WanderLust, key prompts employed, and at least three concrete instances where the AI generated incorrect patterns, how we caught them, and how we resolved them.

---

## 1. AI Tools Used
* **Primary Assistant**: Antigravity (Advanced Agentic AI Coding Assistant by Google DeepMind team).
* **Workspaces**: React / Next.js (App Router), TypeScript, Prisma ORM, Neon PostgreSQL, Socket.io, Tailwind CSS.

---

## 2. Key Prompts

### Database and Seed Setup
> "Write a Prisma seed script to clean the database and populate default users Alice, Bob, Charlie, David, and Tahoe groups, with mock expenses split equally and unequally. Set up standard bcrypt hashes for passwords."

### CSV Parser Logic
> "Write a robust CSV parser in TypeScript that parses lines, handles quoted commas (like '1,200'), cleans names, normalizes percentage splits that sum to other than 100%, and detects duplicates. Log every warning as a structured anomaly object."

### Frontend Ingestion UI
> "Modify the group details page in Next.js to add an 'Import CSV' button, a file selector, and an interactive report card showing stats and an accordion of all warning anomalies resolved during ingestion."

---

## 3. Concrete Cases of AI Errors and Corrections

### Case 1: Prisma 7 LibSQL Adapter Native Compiler Error (Windows)
* **What the AI did**: Suggested initializing the SQLite database with the standard native SQLite node binding and `@prisma/adapter-libsql` as a fallback.
* **How we caught it**: When starting the development server on Windows, the process crashed with compilation errors from `node-gyp` claiming that C++ compiler tools (MSVC/msbuild) were missing.
* **What we changed**: We realized native SQLite bindings compile from source on Windows. We resolved this by transitioning the local workspace config entirely to Neon PostgreSQL (`@prisma/adapter-pg` and pure-JS `pg` package) which does not require local C++ compilers to build, allowing the Next.js dev server to compile and run cleanly.

### Case 2: Vercel Deploy Module Resolution Failure (Prisma Client)
* **What the AI did**: Generated the Prisma Client into a custom output directory `src/generated/prisma` and left the build script in `package.json` as `"build": "next build"`.
* **How we caught it**: The Vercel build log failed with:
  ```text
  Module not found: Can't resolve '@/generated/prisma'
  ```
  This happened because the generated client directory was in `.gitignore` and therefore was not committed to GitHub.
* **What we changed**: We updated the `package.json` build command to `"build": "prisma generate && next build"`. This forces the Vercel build runner to execute `prisma generate` before launching the Next.js build, ensuring the client is generated on the server prior to compiling page routes.

### Case 3: Database Client Environment Loading Sequence
* **What the AI did**: Imported `PrismaClient` on line 1 of `src/lib/prisma.ts` and loaded configuration.
* **How we caught it**: During production build execution (`npm run build`), the build worker crashed, stating that the connection URL was undefined, even though the `.env` file was correctly configured. This was because next-auth and Prisma client initializations were hoisted, executing before Next.js could inject variables.
* **What we changed**: We imported `dotenv/config` on line 1 of `src/lib/prisma.ts` *before* importing the client. This guarantees that environment variables are loaded from the disk into `process.env` before the Prisma runtime evaluates connection bindings.

### Case 4: Express 5 Catch-All Wildcard Route Crash
* **What the AI did**: Configured the custom Socket.io server catch-all route using the wildcard syntax `server.get("*", ...)` standard in Express 4.
* **How we caught it**: The custom server crashed immediately on startup, throwing:
  ```text
  TypeError: Unnamed wildcards are no longer supported in Express 5.
  ```
* **What we changed**: We swapped the catch-all wildcard string `*` with a RegExp pattern literal `/.*/` (i.e. `server.get(/.*/, ...)`). This conforms to Express 5 routing regulations and lets Next.js pages compile cleanly.
