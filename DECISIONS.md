# DECISIONS.md — Technical Decision Log

This log chronicles the major architectural design decisions, considerations, options evaluated, and justifications for the implementation of the WanderLust CSV ingestion pipeline.

---

## 1. Custom CSV Parser vs. External Library (e.g. PapaParse)

* **Context**: The `expenses.csv` sheet contains several formatting issues, including quoted commas (e.g., `"1,200"`), irregular date formats, missing columns, and empty lines.
* **Options Considered**:
  1. *Option A*: Install `papaparse` or `csv-parse`.
  2. *Option B*: Implement a lightweight custom state machine in TypeScript.
* **Decision**: **Option B (Custom State Machine)**.
* **Rationale**: External libraries abstract the parsing process, making it difficult to capture granular row numbers, track raw line text, and write detailed custom error handles on a per-cell basis. By writing a custom character-by-character scanner in `src/lib/csvParser.ts`, we can inspect every token, cleanly resolve quoted commas, normalize whitespace, handle name typos, and log accurate row indexes for the **Import Report** output.

---

## 2. Multi-Currency Integration (USD to INR Mappings)

* **Context**: Several transactions (Goa booking, beach shack lunch, parasailing) were logged in USD, while the main expenses (rent, wifi, groceries) were logged in INR.
* **Options Considered**:
  1. *Option A*: Store multiple currencies in the `Expense` table and compute exchange rates at read time.
  2. *Option B*: Convert all values to a single base currency (INR) at ingestion time.
* **Decision**: **Option B (Convert to INR at Ingestion)**.
* **Rationale**: In a peer-to-peer debt splitting application, maintaining multiple concurrent currencies in a single debt resolution graph introduces substantial mathematical complexity and conversion friction. By converting USD transactions to INR using a standard fixed rate (**1 USD = 83 INR**), we keep the database entries uniform. This allows our greedy debt simplification algorithm to settle balances accurately and transparently without currency mismatch errors.

---

## 3. Auto-Creation of Guest Users

* **Context**: The CSV dataset includes users (Dev, Dev's friend Kabir, Sam) who are not part of the initial seeded group members.
* **Options Considered**:
  1. *Option A*: Fail the import and ask the user to manually add the missing members first.
  2. *Option B*: Quietly map all splits to a dummy "Guest" database user.
  3. *Option C*: Programmatically create system accounts for new users and enroll them in the group during ingestion.
* **Decision**: **Option C (Auto-create and enroll users)**.
* **Rationale**: Rejecting the CSV import creates a bad user experience. Mapping splits to a single "Guest" account destroys personal balance tracking. By programmatically generating user records (e.g. creating `kabir.groupid@example.com` with a hashed default password and dicebear avatar) and enrolling them as `GroupMember`, we maintain database referential integrity, support individual balance accounting, and let new members log in and view their debts later.

---

## 4. Separation of Settlements and Expenses

* **Context**: Row 13 describes "Rohan paid Aisha back" (5000 INR). This is a settlement payback rather than a group expense.
* **Options Considered**:
  1. *Option A*: Import it as a normal expense where Rohan paid 5000 and Aisha owes 5000.
  2. *Option B*: Intercept it during CSV parsing and store it in the `Settlement` table.
* **Decision**: **Option B (Intercept and log as Settlement)**.
* **Rationale**: Expenses and Settlements are distinct entities. An expense represents shared consumption, whereas a settlement represents a cash transfer to balance debts. Storing it as a standard expense would inflate the group's total spending history and misrepresent category metrics. By routing it to the `Settlement` table, we adjust their net balances correctly and keep expense charts clean.

---

## 5. Transaction Isolation & Idempotent Runs

* **Context**: If the user runs the import multiple times, duplicate expenses will clutter the database.
* **Options Considered**:
  1. *Option A*: Append CSV rows on every import trigger.
  2. *Option B*: Provide a "Clear Slate" checkbox (default enabled) that wipes previous expenses and settlements for the group inside a database transaction before committing the clean CSV data.
* **Decision**: **Option B (Idempotent Clear-Slate Import)**.
* **Rationale**: During testing and deployment, users frequently rerun imports to see how the data renders. Wrapping the deletion of existing group expenses and splits inside a Prisma `$transaction` alongside the CSV insert ensures the import remains idempotent, safe, and guarantees that any connection drop results in a full rollback, leaving no partial imports.
