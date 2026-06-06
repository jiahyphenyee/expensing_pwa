'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfirmPage() {
  const [expense, setExpense] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const data = sessionStorage.getItem('lastExpense');
    if (!data) { router.replace('/home'); return; }
    setExpense(JSON.parse(data));
  }, []);

  if (!expense) return null;

  return (
    <main style={{
      minHeight: '100svh', background: '#f8f9fa',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '2rem', textAlign: 'center',
    }}>
      {/* Success icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#e8f5e9', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: '1.5rem',
      }}>
        ✅
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 8px' }}>
        Claim submitted
      </h1>
      <p style={{ fontSize: 14, color: '#666', margin: '0 0 2rem' }}>
        Pending admin review
      </p>

      {/* Summary card */}
      <div style={{
        background: '#fff', border: '0.5px solid #ddd',
        borderRadius: 14, padding: '1.25rem 1.5rem',
        width: '100%', maxWidth: 320,
        textAlign: 'left', marginBottom: '2rem',
      }}>
        {[
          ['Expense ID',  expense.expenseId],
          ['Amount',      `$${parseFloat(expense.amount).toFixed(2)}`],
          ['Project',     expense.projectAddress],
          ['Payee',       expense.payeeName],
          ['Date',        expense.date],
          ['Status',      'Pending admin review'],
          ['Xero',        expense.xeroBillId
                            ? `Draft bill created (${expense.xeroBillId.slice(0, 8)}…)`
                            : '⚠ Xero sync failed — admin will push manually'],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '7px 0', borderBottom: '0.5px solid #f0f0f0',
            fontSize: 13,
          }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{
              fontWeight: label === 'Xero' && !expense.xeroBillId ? 500 : 400,
              color: label === 'Xero' && !expense.xeroBillId
                ? '#c0392b'
                : label === 'Status' ? '#e67e22' : '#1a1a1a',
              maxWidth: '60%', textAlign: 'right',
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        <button
          onClick={() => router.push('/new')}
          style={{
            background: '#1D5C8F', color: '#fff',
            border: 'none', borderRadius: 12,
            padding: '14px', fontSize: 15, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Submit another
        </button>
        <button
          onClick={() => router.push('/history')}
          style={{
            background: '#fff', color: '#1D5C8F',
            border: '1px solid #1D5C8F', borderRadius: 12,
            padding: '14px', fontSize: 15, cursor: 'pointer',
          }}
        >
          View my submissions
        </button>
      </div>
    </main>
  );
}