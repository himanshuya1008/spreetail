import fs from "fs";
import path from "path";
import { parseCsv } from "./src/lib/csvParser";

const csvPath = path.resolve("./expenses.csv");
console.log(`Reading CSV from: ${csvPath}`);

const csvContent = fs.readFileSync(csvPath, "utf-8");
const { records, settlements, anomalies } = parseCsv(csvContent);

console.log("\n--- Ingestion Statistics ---");
console.log(`Total parsed expenses: ${records.length}`);
console.log(`Total parsed settlements: ${settlements.length}`);
console.log(`Total anomalies resolved: ${anomalies.length}`);

console.log("\n--- Unique Names Involved ---");
const names = new Set<string>();
records.forEach((r) => {
  names.add(r.paidBy);
  r.splitWith.forEach((n) => names.add(n));
});
settlements.forEach((s) => {
  names.add(s.fromUser);
  names.add(s.toUser);
});
console.log(Array.from(names));

console.log("\n--- First 3 Cleaned Expenses ---");
records.slice(0, 3).forEach((r) => {
  console.log(`\nRow ${r.rowIndex}:`);
  console.log(`  Date: ${r.date.toLocaleDateString()}`);
  console.log(`  Description: ${r.description}`);
  console.log(`  Paid By: ${r.paidBy}`);
  console.log(`  Amount: ${r.amount} ${r.currency}`);
  console.log(`  Split Type: ${r.splitType}`);
  console.log(`  Split With: ${r.splitWith.join(", ")}`);
});

console.log("\n--- Parsed Settlements ---");
settlements.forEach((s) => {
  console.log(`\nRow ${s.rowIndex}:`);
  console.log(`  Date: ${s.date.toLocaleDateString()}`);
  console.log(`  Description: ${s.description}`);
  console.log(`  From: ${s.fromUser} -> To: ${s.toUser}`);
  console.log(`  Amount: ${s.amount} ${s.currency}`);
});

console.log("\n--- Sample Anomalies Resolved (First 10) ---");
anomalies.slice(0, 10).forEach((a) => {
  console.log(`\nRow ${a.row} [${a.severity}]: ${a.description}`);
  console.log(`  Original Value: ${a.originalValue}`);
  console.log(`  Action Taken: ${a.actionTaken}`);
});
