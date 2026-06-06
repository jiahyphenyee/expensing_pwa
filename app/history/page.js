'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/session';

const STATUS_STYLE = {
  pending:  { bg: '#fff3cd', color: '#856404', label: 'Pending' },
  approved: { bg: '#d4edda', color: '#155724', label: 'Approved' },
  rejected: { bg: '#f8d7da', color: '#721c24', label: 'Rejected' },
  synced:   { bg: '#d1ecf1', color: '#0c5460', label: 'Synced' },
};

export default function HistoryPage() {
  // FIX 1: lazy useState — no setUser needed, no setState in effect
  const [user] = useState(() => {
    if (typeof window === 'undefined') return null;
    return getUser() ?? null;
  });

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const router = useRouter();

  // FIX 2: useCallback declares fetchHistory BEFORE the useEffect that uses it,
  //         eliminating the "accessed before declaration" hoisting error
  const fetchHistory = useCallback(async (u) => {
    try {
      const res = await fetch(`/api/history?user=${encodeURIComponent(u.name)}&role=${u.role}`);
      const data = await res.json();
      setExpenses(data.expenses || []);
    } catch {
      setError('Could not load submissions. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // FIX 3: effect only handles side effects (redirect + fetch), not setState.
  //         router and fetchHistory added to deps array.
  useEffect(() => {
    if (!user) { router.replace('/'); return; }
    fetchHistory(user);
  }, [user, router, fetchHistory]);

  return (
    <main style={{ minHeight: '100svh', background: '#f8f9fa', paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{
        background: '#1D5C8F', padding: '3rem 1.5rem 1rem',
        color: '#fff', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0 }}
        >
          ‹
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>My submissions</h1>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading && <p style={{ color: '#666', textAlign: 'center' }}>Loading…</p>}
        {error   && <p style={{ color: '#c0392b', textAlign: 'center' }}>{error}</p>}

        {!loading && expenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#999' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📭</p>
            <p style={{ fontSize: 15 }}>No submissions yet</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {expenses.map((exp, i) => {
            const s = STATUS_STYLE[exp.status] || STATUS_STYLE.pending;
            return (
              <div key={i} style={{
                background: '#fff', border: '0.5px solid #ddd',
                borderRadius: 14, padding: '1rem 1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>
                      ${parseFloat(exp.amount || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {exp.expenseId}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '3px 10px',
                    borderRadius: 20, background: s.bg, color: s.color,
                  }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                  📍 {exp.displayAddress}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                  <span>{exp.payeeName}</span>
                  <span>{exp.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}