// Expense history page - shows all submissions by the user, with status and details.

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/session';

const STATUS_STYLE = {
  pending:  { bg: '#fff3cd', color: '#856404', label: 'Pending' },
  approved: { bg: '#d4edda', color: '#155724', label: 'Approved' },
  rejected: { bg: '#f8d7da', color: '#721c24', label: 'Rejected' },
  synced:   { bg: '#d1ecf1', color: '#0c5460', label: 'Synced' },
};

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [user] = useState(() => {
    if (typeof window === 'undefined') return null;
    return getUser() ?? null;
  });

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);

  const [addressQuery, setAddressQuery]   = useState('');
  const [amountQuery, setAmountQuery]     = useState('');
  const [debouncedAddress, setDebouncedAddress] = useState('');
  const [debouncedAmount, setDebouncedAmount]   = useState('');

  const router = useRouter();

  // Auth redirect
  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);

  // Debounce address search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedAddress(addressQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [addressQuery]);

  // Debounce amount search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedAmount(amountQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [amountQuery]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          user: user.name,
          role: user.role,
          page,
        });
        if (debouncedAddress) params.set('q', debouncedAddress);
        if (debouncedAmount)  params.set('amount', debouncedAmount);

        const res = await fetch(`/api/history?${params}`);
        const data = await res.json();
        setExpenses(data.expenses || []);
        setTotal(data.total || 0);
      } catch {
        setError('Could not load submissions. Check your connection.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, page, debouncedAddress, debouncedAmount]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isFiltered = debouncedAddress || debouncedAmount;

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
        <button
          onClick={() => router.push('/home')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0 }}
        >
          <img src="/home.svg" alt="Home" style={{ width: 22, height: 22, display: 'block', filter: 'invert(1)' }} />
        </button>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {/* Search */}
        <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>
              Project / Address
            </label>
            <input
              type="search"
              value={addressQuery}
              onChange={e => setAddressQuery(e.target.value)}
              placeholder="Search…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px', fontSize: 16,
                border: '1px solid #ddd', borderRadius: 10,
                background: '#fff', outline: 'none',
              }}
            />
          </div>
          <div style={{ width: 110 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>
              Amount ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountQuery}
              onChange={e => setAmountQuery(e.target.value)}
              placeholder="e.g. 50"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px', fontSize: 16,
                border: '1px solid #ddd', borderRadius: 10,
                background: '#fff', outline: 'none',
              }}
            />
          </div>
        </div>

        {loading && <p style={{ color: '#666', textAlign: 'center' }}>Loading…</p>}
        {error   && <p style={{ color: '#c0392b', textAlign: 'center' }}>{error}</p>}

        {!loading && expenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#999' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📭</p>
            <p style={{ fontSize: 15 }}>{isFiltered ? 'No matching submissions' : 'No submissions yet'}</p>
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
                {exp.description && (
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                    {exp.description}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                  <span>{exp.payeeName}</span>
                  <span>{exp.date}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 16, marginTop: 20,
          }}>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              style={{
                background: page === 1 ? '#eee' : '#1D5C8F',
                color: page === 1 ? '#aaa' : '#fff',
                border: 'none', borderRadius: 8,
                padding: '8px 16px', fontSize: 16, cursor: page === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              ‹ Prev
            </button>
            <span style={{ fontSize: 13, color: '#666' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
              style={{
                background: page >= totalPages ? '#eee' : '#1D5C8F',
                color: page >= totalPages ? '#aaa' : '#fff',
                border: 'none', borderRadius: 8,
                padding: '8px 16px', fontSize: 16, cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
