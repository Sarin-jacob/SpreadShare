import { describe, it, expect } from 'vitest';
import { parsePaymentText, looksLikePayment } from '../src/lib/paymentText.js';

const now = new Date(2026, 9, 2, 12, 0);
const read = (t) => parsePaymentText(t, { now });

// Formats modelled on common Indian bank / UPI / card alerts (numbers and names are made up).
describe('parsePaymentText', () => {
  it('HDFC-style UPI debit (multi-line)', () => {
    const r = read('Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 01/10/26\nRef 627489123456\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808');
    expect(r).toMatchObject({ amount: 450, currency: 'INR', direction: 'out', merchant: 'Swiggy', date: '2026-10-01' });
  });

  it('SBI-style "debited by" without a currency marker', () => {
    const r = read('Dear UPI user A/C X1234 debited by 250.0 on date 01Oct26 trf to RAVI KUMAR Refno 627412345678. If not u? call 1800111109. -SBI');
    expect(r).toMatchObject({ amount: 250, direction: 'out', merchant: 'Ravi Kumar', date: '2026-10-01' });
  });

  it('card spend, ignoring the available limit', () => {
    const r = read('INR 1,299.00 spent using ICICI Bank Card XX4321 on 30-Sep-26 on AMAZON PAY IN. Avl Limit: INR 45,231.50. If not you, call 1800 2662/SMS BLOCK 4321 to 9215676766.');
    expect(r).toMatchObject({ amount: 1299, currency: 'INR', direction: 'out', merchant: 'Amazon Pay', date: '2026-09-30' });
  });

  it('one-field-per-line card alert', () => {
    const r = read('Spent\nCard no. XX9876\nINR 640\n01-10-26 20:15:32\nZOMATO\nAvl Lmt INR 1,20,000\nSMS BLOCK 9876 to 919951860002, if not you - Axis Bank');
    expect(r).toMatchObject({ amount: 640, merchant: 'Zomato', date: '2026-10-01', when: '2026-10-01T20:15' });
  });

  it('UPI handle as the payee', () => {
    const r = read('Sent Rs.120.00 from Kotak Bank AC X5678 to rapido@ybl on 01-10-26.UPI Ref 627500000000. Not you, https://kotak.com/KBANKT/Fraud');
    expect(r).toMatchObject({ amount: 120, merchant: 'Rapido' });
  });

  it('payment app notification', () => {
    expect(read('You paid ₹85 to Chai Point')).toMatchObject({ amount: 85, currency: 'INR', merchant: 'Chai Point', direction: 'out' });
  });

  it('money received', () => {
    const r = read('Rs 500.00 credited to your A/c XX1234 by VPA asha.n@okaxis on 01-10-26 (UPI Ref No 627512345678)');
    expect(r).toMatchObject({ amount: 500, direction: 'in', merchant: 'Asha N' });
  });

  it('skips the balance after the debit', () => {
    const r = read('Your A/c XX1234 is debited with INR 2,000.00 on 02-Oct-26. Avl Bal INR 10,523.45');
    expect(r).toMatchObject({ amount: 2000, date: '2026-10-02' });
  });

  it('foreign currency, month-first date for USD', () => {
    expect(read('You spent $23.40 at STARBUCKS on 10/01/2026')).toMatchObject({ amount: 23.4, currency: 'USD', merchant: 'Starbucks', date: '2026-10-01' });
  });

  it('returns null when there is no payment in the text', () => {
    expect(read('Your OTP for login is 123456. Do not share it with anyone.')).toBeNull();
    expect(read('')).toBeNull();
  });
});

describe('looksLikePayment', () => {
  it('tells payment messages from ordinary notes', () => {
    expect(looksLikePayment('You paid ₹85 to Chai Point')).toBe(true);
    expect(looksLikePayment('Dinner with Asha')).toBe(false);
    expect(looksLikePayment('Paid 300')).toBe(false); // too short to be a message
  });
});
