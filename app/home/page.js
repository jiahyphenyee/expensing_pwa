// Screen 2: Home

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, clearUser } from '@/lib/session';

export default function HomePage() {
  const [user] = useState(() => getUser() ?? null);
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);      

  if (!user) return null;

  return (
    <main style={{
      minHeight: '100svh',
      background: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1D5C8F',
        padding: '3rem 1.5rem 1.5rem',
        color: '#fff',
      }}>
        <p style={{ fontSize: 13, margin: '0 0 4px', opacity: 0.8 }}>
          Logged in as
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>
          {user.name}
        </h1>
        <span style={{
          display: 'inline-block',
          marginTop: 6,
          fontSize: 11,
          background: 'rgba(255,255,255,0.2)',
          padding: '2px 10px',
          borderRadius: 20,
        }}>
          {user.role === 'admin' ? 'Admin' : 'Senior worker'}
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={() => router.push('/new')}
          style={{
            background: '#fff',
            border: '0.5px solid #ddd',
            borderRadius: 14,
            padding: '1.25rem 1.5rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#E8F0F7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            📎
          </div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 3 }}>
              New expense claim
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              Submit a receipt for reimbursement
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#999', fontSize: 20 }}>›</span>
        </button>

        <button
          onClick={() => router.push('/history')}
          style={{
            background: '#fff',
            border: '0.5px solid #ddd',
            borderRadius: 14,
            padding: '1.25rem 1.5rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#E8F0F7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            🕐
          </div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 3 }}>
              My submissions
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              View status of past claims
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#999', fontSize: 20 }}>›</span>
        </button>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 'auto', padding: '1.5rem', textAlign: 'center' }}>
        <button
          onClick={() => { clearUser(); router.replace('/'); }}
          style={{
            background: 'none', border: 'none',
            color: '#999', fontSize: 13, cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}