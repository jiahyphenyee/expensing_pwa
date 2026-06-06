'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser, getUser } from '@/lib/session';

export default function LoginPage() {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If already logged in, skip to home
  useEffect(() => {
    if (getUser()) router.replace('/home');
  }, []);

  async function handleSubmit() {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.user) {
        saveUser(data.user);
        router.push('/home');
      } else {
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    } catch {
      setError('Connection error. Check your internet.');
    }
    setLoading(false);
  }

  return (
    <main style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#f8f9fa',
    }}>
      {/* Logo / title */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: '#1D5C8F', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <span style={{ fontSize: 28, color: '#fff' }}>$</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 4px' }}>
          Expense Claims
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
          Enter your 4-digit PIN
        </p>
      </div>

      {/* PIN input */}
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={pin}
        onChange={e => setPin(e.target.value.slice(0, 4))}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="••••"
        style={{
          width: 140,
          fontSize: 32,
          textAlign: 'center',
          letterSpacing: 12,
          padding: '12px 16px',
          border: '2px solid',
          borderColor: error ? '#c0392b' : '#ddd',
          borderRadius: 12,
          background: '#fff',
          marginBottom: 12,
          outline: 'none',
          MozAppearance: 'textfield',
        }}
        autoFocus
      />

      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={pin.length !== 4 || loading}
        style={{
          background: pin.length === 4 && !loading ? '#1D5C8F' : '#ccc',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '13px 40px',
          fontSize: 15,
          fontWeight: 500,
          cursor: pin.length === 4 && !loading ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s',
        }}
      >
        {loading ? 'Checking…' : 'Continue'}
      </button>
    </main>
  );
}