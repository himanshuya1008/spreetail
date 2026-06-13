export type SplitMethod = 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARES';

export interface SplitParticipant {
  userId: String;
  amountOwed?: number; // Used for UNEQUAL splits
  percentage?: number; // Used for PERCENTAGE splits
  shares?: number;     // Used for SHARES splits
}

export interface CalculatedSplit {
  userId: String;
  owedAmount: number;
}

/**
 * Calculates how much each participant owes based on the split method.
 * Handles decimal rounding adjustments to ensure the sum of splits matches the total amount.
 */
export function calculateSplits(
  amount: number,
  payerId: String,
  participants: SplitParticipant[],
  method: SplitMethod
): CalculatedSplit[] {
  if (participants.length === 0) {
    return [];
  }

  // Work in cents to avoid floating point precision issues
  const totalCents = Math.round(amount * 100);
  let allocatedCents = 0;
  const splits: { userId: String; cents: number }[] = [];

  switch (method) {
    case 'EQUAL': {
      const share = Math.floor(totalCents / participants.length);
      let remainder = totalCents - share * participants.length;

      participants.forEach((p) => {
        // Distribute remainder cents one by one to participants (e.g. starting with payer or first in list)
        const bonus = remainder > 0 ? 1 : 0;
        if (bonus > 0) remainder--;
        splits.push({ userId: p.userId, cents: share + bonus });
      });
      break;
    }

    case 'UNEQUAL': {
      let sumCents = 0;
      participants.forEach((p) => {
        const owedCents = Math.round((p.amountOwed || 0) * 100);
        sumCents += owedCents;
        splits.push({ userId: p.userId, cents: owedCents });
      });

      if (sumCents !== totalCents) {
        throw new Error(`Sum of split amounts (${(sumCents / 100).toFixed(2)}) must equal total amount (${amount.toFixed(2)})`);
      }
      break;
    }

    case 'PERCENTAGE': {
      let percentSum = 0;
      participants.forEach((p) => {
        percentSum += p.percentage || 0;
      });

      // Allow small margin of floating point error on percentage sum, but enforce 100%
      if (Math.abs(percentSum - 100) > 0.01) {
        throw new Error(`Percentages must sum to 100% (currently ${percentSum}%)`);
      }

      let remainingCents = totalCents;
      participants.forEach((p, index) => {
        if (index === participants.length - 1) {
          // Last participant gets the remaining cents to prevent rounding leakage
          splits.push({ userId: p.userId, cents: remainingCents });
        } else {
          const share = Math.floor((totalCents * (p.percentage || 0)) / 100);
          remainingCents -= share;
          splits.push({ userId: p.userId, cents: share });
        }
      });
      break;
    }

    case 'SHARES': {
      let totalShares = 0;
      participants.forEach((p) => {
        totalShares += p.shares || 0;
      });

      if (totalShares <= 0) {
        throw new Error('Total shares must be greater than zero');
      }

      let remainingCents = totalCents;
      participants.forEach((p, index) => {
        if (index === participants.length - 1) {
          splits.push({ userId: p.userId, cents: remainingCents });
        } else {
          const share = Math.floor((totalCents * (p.shares || 0)) / totalShares);
          remainingCents -= share;
          splits.push({ userId: p.userId, cents: share });
        }
      });
      break;
    }

    default:
      throw new Error(`Unsupported split method: ${method}`);
  }

  return splits.map((s) => ({
    userId: s.userId,
    owedAmount: Number((s.cents / 100).toFixed(2)),
  }));
}

export interface RawTransaction {
  fromUserId: String;
  toUserId: String;
  amount: number;
}

export interface SimplifiedDebt {
  fromUserId: String;
  toUserId: String;
  amount: number;
}

/**
 * Greedy Debt Simplification Algorithm
 * 
 * 1. Computes the net balance of each user (credits - debits).
 * 2. Groups users into debtors (net balance < 0) and creditors (net balance > 0).
 * 3. Recursively matches the largest debtor with the largest creditor to resolve balances.
 * 
 * Returns a list of simplified direct payments to settle the debts.
 */
export function simplifyDebts(transactions: RawTransaction[]): SimplifiedDebt[] {
  const balances: Record<string, number> = {};

  // Calculate net balances for each user
  // Positive balance means they are owed money (creditor)
  // Negative balance means they owe money (debtor)
  transactions.forEach((tx) => {
    const amountCents = Math.round(tx.amount * 100);
    balances[tx.fromUserId.toString()] = (balances[tx.fromUserId.toString()] || 0) - amountCents;
    balances[tx.toUserId.toString()] = (balances[tx.toUserId.toString()] || 0) + amountCents;
  });

  const debtors: { userId: string; cents: number }[] = [];
  const creditors: { userId: string; cents: number }[] = [];

  Object.entries(balances).forEach(([userId, cents]) => {
    // Ignore tiny rounding issues (less than 1 cent)
    if (Math.abs(cents) < 1) return;

    if (cents < 0) {
      debtors.push({ userId, cents: Math.abs(cents) });
    } else if (cents > 0) {
      creditors.push({ userId, cents });
    }
  });

  const simplified: SimplifiedDebt[] = [];

  // Sort descending by amount to apply greedy algorithm
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settleCents = Math.min(debtor.cents, creditor.cents);

    if (settleCents > 0) {
      simplified.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: Number((settleCents / 100).toFixed(2)),
      });
    }

    debtor.cents -= settleCents;
    creditor.cents -= settleCents;

    if (debtor.cents < 1) {
      dIdx++;
    }
    if (creditor.cents < 1) {
      cIdx++;
    }
  }

  return simplified;
}
