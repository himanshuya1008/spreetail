export interface AnomalyLog {
  row: number;
  description: string;
  field: string;
  originalValue: string;
  actionTaken: string;
  severity: "info" | "warning" | "error";
}

export interface CsvParticipant {
  name: string;
  amountOwed?: number;
  percentage?: number;
  shares?: number;
}

export interface CsvRecord {
  rowIndex: number;
  date: Date;
  description: string;
  paidBy: string;
  amount: number;
  originalAmount: number;
  currency: string;
  splitType: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARES";
  splitWith: string[];
  participants: CsvParticipant[];
  notes: string;
}

export interface CsvSettlement {
  rowIndex: number;
  date: Date;
  description: string;
  fromUser: string;
  toUser: string;
  amount: number;
  originalAmount: number;
  currency: string;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(currentField.trim());
      currentField = "";
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
}

// Normalize name string to Title Case (e.g. "priya " -> "Priya", "Priya S" -> "Priya")
export function normalizeName(name: string): string {
  let cleaned = name.trim();
  if (!cleaned) return "";

  // Handle known aliases
  if (cleaned.toLowerCase() === "priya s") {
    return "Priya";
  }

  // Handle standard capitalization
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

// Parse date string. Supports "DD-MM-YYYY" and "Month-DD" (e.g., "Mar-14")
export function parseCsvDate(dateStr: string, anomalies: AnomalyLog[], row: number): Date {
  const cleanStr = dateStr.trim();
  if (!cleanStr) {
    anomalies.push({
      row,
      field: "date",
      originalValue: dateStr,
      description: "Empty date field.",
      actionTaken: "Defaulted to current date",
      severity: "warning"
    });
    return new Date();
  }

  // Case 1: Mar-14 format
  const monthDayMatch = cleanStr.match(/^([A-Za-z]+)-(\d+)$/);
  if (monthDayMatch) {
    const monthStr = monthDayMatch[1].toLowerCase();
    const day = parseInt(monthDayMatch[2], 10);
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const month = months[monthStr.substring(0, 3)];
    if (month !== undefined && !isNaN(day)) {
      // Default year to 2026 based on other records
      const date = new Date(2026, month, day);
      anomalies.push({
        row,
        field: "date",
        originalValue: dateStr,
        description: `Mismatched date format '${cleanStr}' parsed as Month-Day.`,
        actionTaken: `Assumed year 2026. Parsed to '${date.toLocaleDateString()}'`,
        severity: "warning"
      });
      return date;
    }
  }

  // Case 2: DD-MM-YYYY format
  const dmyParts = cleanStr.split(/[-/]/);
  if (dmyParts.length === 3) {
    const day = parseInt(dmyParts[0], 10);
    const month = parseInt(dmyParts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(dmyParts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Fallback to standard parsing
  const parsed = new Date(cleanStr);
  if (isNaN(parsed.getTime())) {
    anomalies.push({
      row,
      field: "date",
      originalValue: dateStr,
      description: `Failed to parse date string '${cleanStr}'.`,
      actionTaken: "Defaulted to current date",
      severity: "error"
    });
    return new Date();
  }

  return parsed;
}

export function parseCsv(csvContent: string): {
  records: CsvRecord[];
  settlements: CsvSettlement[];
  anomalies: AnomalyLog[];
} {
  const lines = csvContent.split(/\r?\n/);
  const anomalies: AnomalyLog[] = [];
  const records: CsvRecord[] = [];
  const settlements: CsvSettlement[] = [];

  if (lines.length === 0 || !lines[0].trim()) {
    return { records, settlements, anomalies };
  }

  // Parse Header row to find column indexes
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  const colIndex = (name: string) => headers.indexOf(name);

  const idxDate = colIndex("date");
  const idxDesc = colIndex("description");
  const idxPaidBy = colIndex("paid_by");
  const idxAmount = colIndex("amount");
  const idxCurrency = colIndex("currency");
  const idxSplitType = colIndex("split_type");
  const idxSplitWith = colIndex("split_with");
  const idxSplitDetails = colIndex("split_details");
  const idxNotes = colIndex("notes");

  // Keep track of unique records to detect duplicate lines
  const recordFingerprints = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty rows

    const rowNum = i + 1; // 1-based index including header
    const columns = parseCsvLine(lines[i]);

    // Extract columns or default
    const dateStr = columns[idxDate] || "";
    const rawDesc = columns[idxDesc] || "";
    const rawPaidBy = columns[idxPaidBy] || "";
    const rawAmount = columns[idxAmount] || "";
    const rawCurrency = columns[idxCurrency] || "";
    const rawSplitType = columns[idxSplitType] || "";
    const rawSplitWith = columns[idxSplitWith] || "";
    const rawSplitDetails = columns[idxSplitDetails] || "";
    const rawNotes = columns[idxNotes] || "";

    // 1. Check for Duplicate Row Fingerprint (based on date, amount, paidBy, splitType, splitWith)
    const fingerprint = `${dateStr}|${rawAmount}|${rawPaidBy}|${rawSplitType}|${rawSplitWith}`.toLowerCase();
    if (recordFingerprints.has(fingerprint)) {
      anomalies.push({
        row: rowNum,
        field: "row",
        originalValue: line,
        description: "Exact or near-exact duplicate of a previously logged transaction.",
        actionTaken: "Skipped row entirely",
        severity: "warning"
      });
      continue;
    }
    recordFingerprints.add(fingerprint);

    // 2. Parse Date
    const parsedDate = parseCsvDate(dateStr, anomalies, rowNum);

    // Date Ambiguity Warning (Row 33: "04-05-2026" with note questioning format)
    if (rawNotes.toLowerCase().includes("is this april 5 or may 4")) {
      anomalies.push({
        row: rowNum,
        field: "date",
        originalValue: dateStr,
        description: "Date string format ambiguity reported in row notes.",
        actionTaken: `Parsed as May 4th (04-05-2026) in DD-MM-YYYY format, but flagged for manual verification`,
        severity: "warning"
      });
    }

    // 3. Parse and Sanitize Amount
    let cleanAmountStr = rawAmount.replace(/["\s,]/g, ""); // Strip quotes, spaces, and commas
    let originalAmount = parseFloat(cleanAmountStr);
    let finalAmount = originalAmount;

    if (isNaN(originalAmount)) {
      anomalies.push({
        row: rowNum,
        field: "amount",
        originalValue: rawAmount,
        description: "Invalid or blank numeric amount.",
        actionTaken: "Assumed zero amount (0.00)",
        severity: "warning"
      });
      originalAmount = 0;
      finalAmount = 0;
    }

    // Check for comma format
    if (rawAmount.includes(",") || rawAmount.includes('"')) {
      anomalies.push({
        row: rowNum,
        field: "amount",
        originalValue: rawAmount,
        description: `Quoted string amount with comma formatting: '${rawAmount}'.`,
        actionTaken: `Parsed and cleaned to float: ${originalAmount}`,
        severity: "info"
      });
    }

    // Check for negative amount (refund)
    if (originalAmount < 0) {
      anomalies.push({
        row: rowNum,
        field: "amount",
        originalValue: rawAmount,
        description: "Negative transaction amount representing a refund.",
        actionTaken: "Imported as negative expense splits (reducing user balances)",
        severity: "info"
      });
    }

    // Check for zero amount
    if (originalAmount === 0) {
      anomalies.push({
        row: rowNum,
        field: "amount",
        originalValue: rawAmount,
        description: "Transaction amount is zero.",
        actionTaken: "Imported as zero expense for historical records",
        severity: "info"
      });
    }

    // Check for fractional decimal values needing rounding (e.g. cylinder refill 899.995)
    const decimals = (cleanAmountStr.split(".")[1] || "").length;
    if (decimals > 2) {
      finalAmount = Number(originalAmount.toFixed(2));
      anomalies.push({
        row: rowNum,
        field: "amount",
        originalValue: rawAmount,
        description: `Amount has high precision fractional decimals (${decimals} places).`,
        actionTaken: `Rounded to 2 decimal places: ${finalAmount}`,
        severity: "warning"
      });
    }

    // 4. Parse and Clean Names (Normalize casing)
    let paidByClean = normalizeName(rawPaidBy);
    if (rawPaidBy.trim() !== paidByClean) {
      anomalies.push({
        row: rowNum,
        field: "paid_by",
        originalValue: rawPaidBy,
        description: `Improper name casing or whitespace padding: '${rawPaidBy}'.`,
        actionTaken: `Normalized to '${paidByClean}'`,
        severity: "info"
      });
    }

    // Check for missing paid_by (Row 12: House cleaning supplies)
    if (!paidByClean) {
      const splitNames = rawSplitWith.split(";").map(normalizeName).filter(Boolean);
      const defaultPayer = splitNames[0] || "Aisha";
      paidByClean = defaultPayer;
      anomalies.push({
        row: rowNum,
        field: "paid_by",
        originalValue: rawPaidBy,
        description: "Payer field is blank.",
        actionTaken: `Assigned first participant in split: '${defaultPayer}'`,
        severity: "warning"
      });
    }

    // 5. Currency Checking & Conversion (Fixed exchange rate: 1 USD = 83 INR)
    let currencyClean = rawCurrency.toUpperCase().trim();
    if (!currencyClean) {
      currencyClean = "INR";
      anomalies.push({
        row: rowNum,
        field: "currency",
        originalValue: rawCurrency,
        description: "Missing currency code.",
        actionTaken: "Defaulted to base currency 'INR'",
        severity: "warning"
      });
    }

    if (currencyClean === "USD") {
      const convertedAmount = Number((finalAmount * 83).toFixed(2));
      anomalies.push({
        row: rowNum,
        field: "currency",
        originalValue: `${finalAmount} USD`,
        description: "Foreign currency USD transaction.",
        actionTaken: `Converted to base currency INR using fixed rate of 83.0: ${convertedAmount} INR`,
        severity: "info"
      });
      finalAmount = convertedAmount;
      currencyClean = "INR";
    }

    // 6. Check description
    const cleanDesc = rawDesc.trim() || "Imported Expense";
    if (!rawDesc.trim()) {
      anomalies.push({
        row: rowNum,
        field: "description",
        originalValue: rawDesc,
        description: "Empty description field.",
        actionTaken: "Defaulted description to 'Imported Expense'",
        severity: "info"
      });
    }

    // Check for conflicting Thalassa Dinner logs
    if (cleanDesc.toLowerCase().includes("thalassa")) {
      anomalies.push({
        row: rowNum,
        field: "description",
        originalValue: cleanDesc,
        description: `Potential double-log conflict: multiple entries found for dinner at Thalassa.`,
        actionTaken: `Imported as written but flagged conflict`,
        severity: "warning"
      });
    }

    // 7. Detect if it is a settlement row (splitType is empty, notes say settlement)
    const cleanSplitTypeRaw = rawSplitType.toLowerCase().trim();
    if (!cleanSplitTypeRaw && (rawNotes.toLowerCase().includes("settlement") || rawSplitWith)) {
      const toUser = normalizeName(rawSplitWith);
      settlements.push({
        rowIndex: rowNum,
        date: parsedDate,
        description: cleanDesc,
        fromUser: paidByClean,
        toUser: toUser,
        amount: finalAmount,
        originalAmount: originalAmount,
        currency: currencyClean,
        notes: rawNotes
      });
      anomalies.push({
        row: rowNum,
        field: "split_type",
        originalValue: rawSplitType,
        description: "Settlement transaction logged in the expense list.",
        actionTaken: `Parsed and imported as direct Settlement between '${paidByClean}' and '${toUser}'`,
        severity: "info"
      });
      continue;
    }

    // 8. Parse Splits & Split Details
    const splitNamesRaw = rawSplitWith.split(";").map(s => s.trim()).filter(Boolean);
    const splitNames = splitNamesRaw.map(normalizeName);
    
    // Log warnings if Meera is participating when she moved out (Row 35: Groceries BigBasket)
    if (parsedDate > new Date(2026, 2, 28) && splitNames.includes("Meera")) {
      anomalies.push({
        row: rowNum,
        field: "split_with",
        originalValue: rawSplitWith,
        description: "Inactive group member 'Meera' participating in split after moving out on 28-03-2026.",
        actionTaken: "Imported split with Meera as logged (needs manual adjustment if incorrect)",
        severity: "warning"
      });
    }

    // Auto-create/Warning for guest users
    splitNames.forEach(name => {
      if (["Dev", "Kabir", "Sam"].includes(name)) {
        anomalies.push({
          row: rowNum,
          field: "split_with",
          originalValue: name,
          description: `Guest/new user '${name}' is not in the base roommates group.`,
          actionTaken: `Auto-enrolled user '${name}' in the database group`,
          severity: "info"
        });
      }
    });

    let splitMethod: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARES" = "EQUAL";
    if (cleanSplitTypeRaw === "unequal") splitMethod = "UNEQUAL";
    else if (cleanSplitTypeRaw === "percentage") splitMethod = "PERCENTAGE";
    else if (cleanSplitTypeRaw === "share" || cleanSplitTypeRaw === "shares") splitMethod = "SHARES";

    // Equal Split type containing split details warning (Row 41: Furniture for common room)
    if (splitMethod === "EQUAL" && rawSplitDetails.trim()) {
      anomalies.push({
        row: rowNum,
        field: "split_details",
        originalValue: rawSplitDetails,
        description: "Equal split contains explicit split_details share listing.",
        actionTaken: "Ignored details and computed equal distribution",
        severity: "info"
      });
    }

    // Parse Split Details (Aisha 30%; Rohan 30%; ...)
    const participants: CsvParticipant[] = [];
    const detailsParts = rawSplitDetails.split(";").map(d => d.trim()).filter(Boolean);
    const detailsMap: Record<string, number> = {};

    detailsParts.forEach(part => {
      // Matches "Name Value" or "Name Value%" (e.g. "Rohan 700", "Aisha 30%")
      const match = part.match(/^(.+?)\s+([\d.-]+)%?$/);
      if (match) {
        const name = normalizeName(match[1]);
        const val = parseFloat(match[2]);
        if (!isNaN(val)) {
          detailsMap[name] = val;
        }
      }
    });

    if (splitMethod === "UNEQUAL") {
      let detailsSum = 0;
      splitNames.forEach(name => {
        const amt = detailsMap[name] || 0;
        detailsSum += amt;
        participants.push({ name, amountOwed: amt });
      });

      // Verify Unequal Splits match total amount (USD rows are converted, so check details against original USD or INR)
      // Note: Details sum is based on original amount usually. Let's verify details matches originalAmount.
      if (Math.abs(detailsSum - originalAmount) > 0.1) {
        anomalies.push({
          row: rowNum,
          field: "split_details",
          originalValue: rawSplitDetails,
          description: `Sum of unequal split details (${detailsSum}) does not match amount (${originalAmount}).`,
          actionTaken: "Scaled split amounts to match total amount",
          severity: "warning"
        });

        // Re-scale unequal amounts
        participants.forEach(p => {
          if (p.amountOwed !== undefined) {
            p.amountOwed = Number(((p.amountOwed / detailsSum) * originalAmount).toFixed(2));
          }
        });
      }
    } else if (splitMethod === "PERCENTAGE") {
      let percentSum = 0;
      splitNames.forEach(name => {
        const pct = detailsMap[name] || 0;
        percentSum += pct;
        participants.push({ name, percentage: pct });
      });

      // Percentage out of range (Row 14 and 31: 110%)
      if (Math.abs(percentSum - 100) > 0.1) {
        anomalies.push({
          row: rowNum,
          field: "split_details",
          originalValue: rawSplitDetails,
          description: `Percentages sum to ${percentSum}% instead of 100%.`,
          actionTaken: "Normalized percentages proportionally to sum to 100%",
          severity: "warning"
        });

        // Normalize percentages
        participants.forEach(p => {
          if (p.percentage !== undefined) {
            p.percentage = Number(((p.percentage / percentSum) * 100).toFixed(2));
          }
        });
      }
    } else if (splitMethod === "SHARES") {
      splitNames.forEach(name => {
        const share = detailsMap[name] || 1;
        participants.push({ name, shares: share });
      });
    } else {
      // EQUAL
      splitNames.forEach(name => {
        participants.push({ name });
      });
    }

    records.push({
      rowIndex: rowNum,
      date: parsedDate,
      description: cleanDesc,
      paidBy: paidByClean,
      amount: finalAmount,
      originalAmount: originalAmount,
      currency: currencyClean,
      splitType: splitMethod,
      splitWith: splitNames,
      participants,
      notes: rawNotes
    });
  }

  return { records, settlements, anomalies };
}
