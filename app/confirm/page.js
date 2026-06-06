'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfirmPage() {
  const router = useRouter();

  const [expense] = useState(() => {
    if (typeof window === 'undefined') return null; // SSR guard
    const data = sessionStorage.getItem('lastExpense');
    return data ? JSON.parse(data) : null;
  });

  const [shareStatus, setShareStatus] = useState('idle'); // 'idle' | 'sharing' | 'done'

  useEffect(() => {
    if (!expense) router.replace('/home');
  }, [expense, router]);

  async function handleShare() {
    if (typeof navigator.share !== 'function') return;
    setShareStatus('sharing');

    const lines = [
      'Expense submitted',
      `ID: ${expense.expenseId}`,
      `Amount: $${parseFloat(expense.amount).toFixed(2)}`,
      `Project: ${expense.projectAddress}`,
      `Payee: ${expense.payeeName}`,
      `Date: ${expense.date}`,
      expense.category ? `Category: ${expense.category}` : null,
      'Status: Pending admin review',
      'Xero Bill Ref: ' + (expense.xeroBillId
        ? `Draft bill created (${expense.xeroBillId.slice(0, 8)}…)`
        : 'Xero sync failed.'),
    ].filter(Boolean);
    const text = lines.join('\n');
    const shareData = { text };

    // Build files array: .txt summary first (received by AirDrop), then receipt images.
    // AirDrop ignores the `text` field and only passes files, so the .txt ensures
    // the summary always arrives regardless of share target.
    try {
      const textFile = new File(
        [new Blob([text], { type: 'text/plain' })],
        `${expense.date}_${expense.expenseId}.txt`,
        { type: 'text/plain' },
      );
      const allFiles = [textFile];

      const raw = sessionStorage.getItem('lastExpenseFiles');
      if (raw) {
        JSON.parse(raw).forEach(f => {
          const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
          allFiles.push(new File([bytes], f.name, { type: f.type }));
        });
      }

      if (navigator.canShare?.({ files: allFiles })) {
        shareData.files = allFiles;
      }
    } catch {
      // Fall back to text-only share
    }

    try {
      await navigator.share(shareData);
      setShareStatus('done');
    } catch (err) {
      if (err.name !== 'AbortError') setShareStatus('done');
      else setShareStatus('idle');
    }
  }

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
          ['Xero Bill Ref',        expense.xeroBillId
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
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            onClick={handleShare}
            disabled={shareStatus === 'sharing'}
            style={{
              background: '#25D366', color: '#fff',
              border: 'none', borderRadius: 12,
              padding: '14px', fontSize: 15, fontWeight: 500,
              cursor: shareStatus === 'sharing' ? 'not-allowed' : 'pointer',
            }}
          >
            {shareStatus === 'sharing' ? 'Opening share sheet…' : 'Share to'}
          </button>
        )}
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