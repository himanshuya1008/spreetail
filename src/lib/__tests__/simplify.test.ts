import { describe, it, expect } from 'vitest';
import { calculateSplits, simplifyDebts, RawTransaction } from '../simplify';

describe('Split Calculation Engine', () => {
  it('splits equally and handles cent rounding adjustments', () => {
    const participants = [
      { userId: '1' },
      { userId: '2' },
      { userId: '3' },
    ];
    // $10.00 / 3 = 3.33333333333...
    // Expected: 3.34, 3.33, 3.33
    const result = calculateSplits(10.00, '1', participants, 'EQUAL');
    
    expect(result).toHaveLength(3);
    const sum = result.reduce((acc, curr) => acc + curr.owedAmount, 0);
    expect(sum).toBe(10.00);
    
    expect(result[0].owedAmount).toBe(3.34);
    expect(result[1].owedAmount).toBe(3.33);
    expect(result[2].owedAmount).toBe(3.33);
  });

  it('splits unequally matching inputs', () => {
    const participants = [
      { userId: '1', amountOwed: 2.50 },
      { userId: '2', amountOwed: 7.50 },
    ];
    const result = calculateSplits(10.00, '1', participants, 'UNEQUAL');
    expect(result).toHaveLength(2);
    expect(result[0].owedAmount).toBe(2.50);
    expect(result[1].owedAmount).toBe(7.50);
  });

  it('throws error when unequal splits do not sum to total', () => {
    const participants = [
      { userId: '1', amountOwed: 2.50 },
      { userId: '2', amountOwed: 7.00 }, // sum 9.50 != 10.00
    ];
    expect(() => calculateSplits(10.00, '1', participants, 'UNEQUAL')).toThrow();
  });

  it('splits by percentage', () => {
    const participants = [
      { userId: '1', percentage: 50 },
      { userId: '2', percentage: 25 },
      { userId: '3', percentage: 25 },
    ];
    const result = calculateSplits(100.00, '1', participants, 'PERCENTAGE');
    expect(result[0].owedAmount).toBe(50.00);
    expect(result[1].owedAmount).toBe(25.00);
    expect(result[2].owedAmount).toBe(25.00);
  });

  it('splits by shares proportionally', () => {
    const participants = [
      { userId: '1', shares: 2 },
      { userId: '2', shares: 1 },
      { userId: '3', shares: 1 },
    ];
    const result = calculateSplits(100.00, '1', participants, 'SHARES');
    expect(result[0].owedAmount).toBe(50.00);
    expect(result[1].owedAmount).toBe(25.00);
    expect(result[2].owedAmount).toBe(25.00);
  });
});

describe('Greedy Debt Simplification Graph Engine', () => {
  it('simplifies linear transitive debts', () => {
    // A owes B 10, B owes C 10 -> A owes C 10
    const txs: RawTransaction[] = [
      { fromUserId: 'A', toUserId: 'B', amount: 10.00 },
      { fromUserId: 'B', toUserId: 'C', amount: 10.00 },
    ];
    const result = simplifyDebts(txs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      fromUserId: 'A',
      toUserId: 'C',
      amount: 10.00,
    });
  });

  it('resolves transaction cycles into empty list', () => {
    // A owes B 10, B owes C 10, C owes A 10 -> Net is 0 for everyone
    const txs: RawTransaction[] = [
      { fromUserId: 'A', toUserId: 'B', amount: 10.00 },
      { fromUserId: 'B', toUserId: 'C', amount: 10.00 },
      { fromUserId: 'C', toUserId: 'A', amount: 10.00 },
    ];
    const result = simplifyDebts(txs);
    expect(result).toHaveLength(0);
  });

  it('simplifies complex multi-party debt networks', () => {
    // A owes B 10, A owes C 20, B owes C 5, D owes A 15
    // Net:
    // A: -10 - 20 + 15 = -15 (owes 15)
    // B: +10 - 5 = +5 (owed 5)
    // C: +20 + 5 = +25 (owed 25)
    // D: -15 (owes 15)
    // Debtors: A (15), D (15)
    // Creditors: C (25), B (5)
    // Greedy Match 1: Debtor A pays Creditor C 15 -> A done (0), C still owed 10
    // Greedy Match 2: Debtor D pays Creditor C 10 -> D owes 5, C done (0)
    // Greedy Match 3: Debtor D pays Creditor B 5 -> D done (0), B done (0)
    // Final simplified payments:
    // A -> C: 15
    // D -> C: 10
    // D -> B: 5
    const txs: RawTransaction[] = [
      { fromUserId: 'A', toUserId: 'B', amount: 10.00 },
      { fromUserId: 'A', toUserId: 'C', amount: 20.00 },
      { fromUserId: 'B', toUserId: 'C', amount: 5.00 },
      { fromUserId: 'D', toUserId: 'A', amount: 15.00 },
    ];
    const result = simplifyDebts(txs);
    expect(result).toHaveLength(3);
    
    // Check that sum of original is same as simplified
    const originalSum = txs.reduce((acc, c) => acc + c.amount, 0);
    const simplifiedSum = result.reduce((acc, c) => acc + c.amount, 0);
    // Note: total transactions amount sum may decrease (debt is simplified, so total volume decreases)
    expect(simplifiedSum).toBeLessThanOrEqual(originalSum);

    // Verify balances are still exactly preserved
    const originalBalances: Record<string, number> = {};
    txs.forEach((tx) => {
      originalBalances[tx.fromUserId.toString()] = (originalBalances[tx.fromUserId.toString()] || 0) - tx.amount;
      originalBalances[tx.toUserId.toString()] = (originalBalances[tx.toUserId.toString()] || 0) + tx.amount;
    });

    const simplifiedBalances: Record<string, number> = {};
    result.forEach((tx) => {
      simplifiedBalances[tx.fromUserId.toString()] = (simplifiedBalances[tx.fromUserId.toString()] || 0) - tx.amount;
      simplifiedBalances[tx.toUserId.toString()] = (simplifiedBalances[tx.toUserId.toString()] || 0) + tx.amount;
    });

    Object.keys(originalBalances).forEach((user) => {
      expect(Math.abs((simplifiedBalances[user] || 0) - originalBalances[user])).toBeLessThan(0.01);
    });
  });
});
