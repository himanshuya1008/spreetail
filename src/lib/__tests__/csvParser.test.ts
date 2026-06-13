import { describe, it, expect } from "vitest";
import { parseCsv, normalizeName } from "../csvParser";

describe("csvParser", () => {
  it("normalizes user names correctly", () => {
    expect(normalizeName("priya ")).toBe("Priya");
    expect(normalizeName("Priya S")).toBe("Priya");
    expect(normalizeName("rohan ")).toBe("Rohan");
  });

  it("handles duplicate rows, negative amounts, quoted commas, percentage normalization, and foreign currencies", () => {
    const csvData = `date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
08-02-2026,Dinner at Marina Bites,Dev,3200,INR,equal,Aisha;Rohan;Priya;Dev,,Dev visiting for the weekend
08-02-2026,dinner - marina bites,Dev,3200,INR,equal,Aisha;Rohan;Priya;Dev,,
10-02-2026,Electricity Feb,Aisha,"1,200",INR,equal,Aisha;Rohan;Priya;Meera,,
15-02-2026,Cylinder refill,Rohan,899.995,INR,equal,Aisha;Rohan;Priya;Meera,,
18-02-2026,Groceries DMart,Priya S,1875,INR,equal,Aisha;Rohan;Priya;Meera,,
25-02-2026,Rohan paid Aisha back,Rohan,5000,INR,,Aisha,,this is a settlement not an expense??
28-02-2026,Pizza Friday,Aisha,1440,INR,percentage,Aisha;Rohan;Priya;Meera,Aisha 30%; Rohan 30%; Priya 30%; Meera 20%,percentages might be off
09-03-2026,Goa villa booking,Dev,540,USD,equal,Aisha;Rohan;Priya;Dev,,booked on intl site
12-03-2026,Parasailing refund,Dev,-30,USD,equal,Aisha;Rohan;Priya;Dev,,one slot got cancelled
Mar-14,Airport cab,rohan ,1100,INR,equal,Aisha;Rohan;Priya;Dev,,
15-03-2026,Groceries DMart,Priya,2105,,equal,Aisha;Rohan;Priya;Meera,,forgot to set currency
`;

    const { records, settlements, anomalies } = parseCsv(csvData);

    // Duplicate Check
    expect(records.some(r => r.description === "dinner - marina bites")).toBe(false);
    expect(anomalies.some(a => a.description.includes("duplicate"))).toBe(true);

    // Quoted amount check
    const electricity = records.find(r => r.description === "Electricity Feb");
    expect(electricity?.amount).toBe(1200);

    // High precision decimal check
    const cylinder = records.find(r => r.description === "Cylinder refill");
    expect(cylinder?.amount).toBe(900.00);

    // Name typo check
    const groceries = records.find(r => r.description === "Groceries DMart" && r.rowIndex === 6);
    expect(groceries?.paidBy).toBe("Priya");

    // Settlement check
    expect(settlements.length).toBe(1);
    expect(settlements[0].fromUser).toBe("Rohan");
    expect(settlements[0].toUser).toBe("Aisha");

    // Percentage Normalization
    const pizza = records.find(r => r.description === "Pizza Friday");
    expect(pizza?.participants.find(p => p.name === "Aisha")?.percentage).toBeCloseTo(27.27, 1);

    // USD currency conversion
    const villa = records.find(r => r.description === "Goa villa booking");
    expect(villa?.amount).toBe(540 * 83); // 44820

    // Negative Refund
    const refund = records.find(r => r.description === "Parasailing refund");
    expect(refund?.amount).toBe(-30 * 83); // -2490

    // Month-DD format
    const cab = records.find(r => r.description === "Airport cab");
    expect(cab?.date.getMonth()).toBe(2); // March
    expect(cab?.date.getDate()).toBe(14);
    expect(cab?.date.getFullYear()).toBe(2026);

    // Missing Currency check
    const groceriesMissingCurr = records.find(r => r.description === "Groceries DMart" && r.rowIndex === 12);
    expect(groceriesMissingCurr?.currency).toBe("INR");
  });
});
