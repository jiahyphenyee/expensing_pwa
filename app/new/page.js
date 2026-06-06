// Screen 3: Expense form + receipt upload

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/session';
import { GENERAL_PROJECT, UNLINKED_PROJECT } from '@/lib/constants';

async function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1200;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, required, children, error }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 500,
        color: '#555', marginBottom: 6, textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}{required && <span style={{ color: '#c0392b' }}> *</span>}
      </label>
      {children}
      {error && (
        <p style={{ color: '#c0392b', fontSize: 12, margin: '4px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', fontSize: 15, padding: '11px 13px',
  border: '1px solid #ddd', borderRadius: 10,
  background: '#fff', color: '#1a1a1a',
  boxSizing: 'border-box', appearance: 'none',
};

// ── Searchable dropdown ───────────────────────────────────────────────────────
function SearchableDropdown({
  options, value, placeholder,
  onSelect, renderOption, renderSelected,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const wrapperRef        = useRef();

  const filtered = query.trim()
    ? options.filter(o =>
        renderOption(o).toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = value ? renderSelected(value) : null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        style={{
          ...inputStyle, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: selectedLabel ? '#1a1a1a' : '#999',
        }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', flex: 1,
        }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', border: '1px solid #ddd', borderRadius: 10,
          zIndex: 100, marginTop: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 280, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid #eee' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', fontSize: 14, padding: '7px 10px',
                border: '1px solid #eee', borderRadius: 8,
                background: '#f8f9fa', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{
                padding: '12px 14px', fontSize: 13,
                color: '#999', fontStyle: 'italic',
              }}>
                {/* FIX: unescaped quotes replaced with curly-brace expressions */}
                No results for {'"'}{query}{'"'}
              </div>
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => { onSelect(opt); setOpen(false); setQuery(''); }}
                  style={{
                    padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                    borderBottom: i < filtered.length - 1
                      ? '0.5px solid #f5f5f5' : 'none',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {renderOption(opt)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable dropdown with freetext fallback ────────────────────────────────
function SearchableDropdownWithFreetext({
  options, value, placeholder,
  onSelect, renderOption, renderSelected,
  freetextLabel = 'Use',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const wrapperRef        = useRef();

  const filtered = query.trim()
    ? options.filter(o =>
        renderOption(o).toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    function handler(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = value ? renderSelected(value) : null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        style={{
          ...inputStyle, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: selectedLabel ? '#1a1a1a' : '#999',
        }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', flex: 1,
        }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', border: '1px solid #ddd', borderRadius: 10,
          zIndex: 100, marginTop: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 280, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid #eee' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search or type a name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', fontSize: 14, padding: '7px 10px',
                border: '1px solid #eee', borderRadius: 8,
                background: '#f8f9fa', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map((opt, i) => (
              <div
                key={i}
                onClick={() => { onSelect(opt); setOpen(false); setQuery(''); }}
                style={{
                  padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                  borderBottom: '0.5px solid #f5f5f5',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {renderOption(opt)}
              </div>
            ))}

            {/* FIX: unescaped quotes replaced with curly-brace expressions */}
            {query.trim() &&
              !options.find(
                o => renderOption(o).toLowerCase() === query.toLowerCase()
              ) && (
              <div
                onClick={() => {
                  onSelect({ id: '', name: query.trim(), type: 'freetext' });
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                  borderTop: '0.5px solid #eee',
                  color: '#1D5C8F', fontWeight: 500,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                ＋ {freetextLabel} {'"'}{query.trim()}{'"'}
              </div>
            )}

            {filtered.length === 0 && !query.trim() && (
              <div style={{
                padding: '12px 14px', fontSize: 13,
                color: '#999', fontStyle: 'italic',
              }}>
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewExpensePage() {
  const router       = useRouter();
  const fileInputRef = useRef();

  // FIX 1: lazy useState initializer — reads user from session once, no setState in effect
  const [user] = useState(() => {
    if (typeof window === 'undefined') return null;
    return getUser() ?? null;
  });

  const [dropdowns, setDropdowns]               = useState(null);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);
  const [submitting, setSubmitting]             = useState(false);
  const [attachProgress, setAttachProgress]     = useState([]);
  const [errors, setErrors]                     = useState({});

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date:             today,
    projectCode:      '',
    projectAddress:   '',
    amount:           '',
    payeeDisplayName: '',
    payeeId:          '',
    payeeName:        '',
    payeeType:        '',
    category:         '',
    description:      '',
  });

  const [files, setFiles] = useState([]);
  // Each file: { id, file, name, status: 'ready' }

  // ── Auth redirect ──────────────────────────────────────────────────────────
  // FIX 2: useEffect now only handles the side effect (redirect), not setState.
  //         router added to deps to satisfy exhaustive-deps warning.
  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);

  // ── Load dropdowns ─────────────────────────────────────────────────────────
  // FIX 3: Separated from auth effect. Gated on user so it only runs when authed.
  useEffect(() => {
    if (!user) return;
    fetch('/api/dropdowns')
      .then(r => r.json())
      .then(data => { setDropdowns(data); setLoadingDropdowns(false); })
      .catch(() => setLoadingDropdowns(false));
  }, [user]);

  // ── Field helpers ──────────────────────────────────────────────────────────
  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  }

  // ── Project options — General first, sheet projects after, no duplicates ───
  const projectOptions = dropdowns ? [
    GENERAL_PROJECT,
    ...dropdowns.activeProjects.filter(p => p.code !== GENERAL_PROJECT.code),
  ] : [];

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleProjectSelect(project) {
    if (project.type === 'freetext') {
      setField('projectCode', UNLINKED_PROJECT.code);
      setField('projectAddress', project.name);
    } else {
      setField('projectCode', project.code);
      setField('projectAddress', project.address);
    }
  }

  function handlePayeeSelect(payee) {
    setField('payeeId',   payee.type === 'freetext' ? '' : payee.id);
    setField('payeeName', payee.name);
    setField('payeeType', payee.type);
    setField('payeeDisplayName', payee.displayName || payee.name);
  }

  function handleCategorySelect(cat) {
    setField('category', cat.code);
  }

  function handleFilePick(e) {
    const picked   = Array.from(e.target.files);
    const newFiles = picked.map(file => ({
      id:     `${Date.now()}_${Math.random()}`,
      file,
      name:   file.name,
      status: 'ready',
    }));
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  }

  function removeFile(id) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.date)        e.date        = 'Required';
    if (!form.projectCode) e.projectCode = 'Required';
    if (!form.amount)      e.amount      = 'Required';
    if (!form.payeeName)   e.payeeId     = 'Required';
    if (form.projectCode === GENERAL_PROJECT.code && !form.description.trim()) {
      e.description = 'Please describe the site or reason since no project was selected';
    }
    if (files.length === 0) e.files = 'At least one receipt required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);

    try {
      const submitRes = await fetch('/api/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          submittedBy: user.name,
        }),
      });

      const submitData = await submitRes.json();

      if (!submitData.success) {
        setErrors({ submit: 'Submission failed. Please try again.' });
        setSubmitting(false);
        return;
      }

      const { expenseId, xeroBillId } = submitData;

      const progress = files.map(f => ({ name: f.name, status: 'pending' }));
      setAttachProgress(progress);

      for (let i = 0; i < files.length; i++) {
        setAttachProgress(prev =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'uploading' } : p
          )
        );

        try {
          const body = new FormData();
          body.append('file',       files[i].file);
          body.append('xeroBillId', xeroBillId);

          const attachRes  = await fetch('/api/attach', { method: 'POST', body });
          const attachData = await attachRes.json();

          setAttachProgress(prev =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: attachData.success ? 'done' : 'error' }
                : p
            )
          );
        } catch {
          setAttachProgress(prev =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'error' } : p
            )
          );
        }
      }

      sessionStorage.setItem('lastExpense', JSON.stringify({
        expenseId,
        amount:         form.amount,
        projectAddress: form.projectAddress,
        payeeName:      form.payeeName,
        date:           form.date,
        category:       form.category
          ? (dropdowns?.activeCategories.find(c => c.code === form.category)?.name ?? '')
          : '',
        xeroBillId,
      }));

      // Store compressed receipt files for share sheet — best-effort, text-only share if quota exceeded
      sessionStorage.removeItem('lastExpenseFiles');
      try {
        const stored = await Promise.all(files.map(async f => {
          const blob = f.file.type.startsWith('image/')
            ? await compressImage(f.file)
            : f.file;
          const buf = await blob.arrayBuffer();
          return { name: f.name, type: blob.type || f.file.type, data: bufToBase64(buf) };
        }));
        sessionStorage.setItem('lastExpenseFiles', JSON.stringify(stored));
      } catch {
        // Quota exceeded or compression error — share will proceed text-only
      }

      router.push('/confirm');

    } catch {
      setErrors({ submit: 'Connection error. Check your internet and try again.' });
    }

    setSubmitting(false);
  }

  // ── Loading / auth guard ───────────────────────────────────────────────────
  if (!user || loadingDropdowns) return (
    <main style={{
      minHeight: '100svh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <p style={{ color: '#666' }}>Loading…</p>
    </main>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100svh', background: '#f8f9fa', paddingBottom: '2rem' }}>

      {/* Header */}
      <div style={{
        background: '#1D5C8F', padding: '3rem 1.5rem 1rem',
        color: '#fff', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', border: 'none',
            color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0,
          }}
        >‹</button>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>
          New expense
        </h1>
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* Date */}
        <Field label="Date" required error={errors.date}>
          <input
            type="date"
            value={form.date}
            onChange={e => setField('date', e.target.value)}
            style={{
              ...inputStyle,
              borderColor: errors.date ? '#c0392b' : '#ddd',
            }}
          />
        </Field>

        {/* Project */}
        <Field label="Project / site address" required error={errors.projectCode}>
          <SearchableDropdownWithFreetext
            options={projectOptions}
            value={form.projectCode
              ? { code: form.projectCode, address: form.projectAddress }
              : null
            }
            placeholder="Search by address…"
            onSelect={handleProjectSelect}
            renderOption={p =>
              p.code === GENERAL_PROJECT.code
                ? `🗂 ${p.address}`
                : `${p.address}${p.code ? ` (${p.code})` : ''}`
            }
            renderSelected={p =>
              p.code === GENERAL_PROJECT.code
                ? `🗂 ${p.address}`
                : `${p.address}${p.code ? ` (${p.code})` : ''}`
            }
            freetextLabel="Use as project address:"
          />
          {form.projectCode === UNLINKED_PROJECT.code && (
            <p style={{ fontSize: 12, color: '#e67e22', margin: '5px 0 0' }}>
              ⚠ Project not in system yet — admin will link it after review
            </p>
          )}
        </Field>

        {/* Amount */}
        <Field label="Amount (SGD)" required error={errors.amount}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 13, top: '50%',
              transform: 'translateY(-50%)', color: '#999', fontSize: 15,
            }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setField('amount', e.target.value)}
              style={{
                ...inputStyle,
                paddingLeft: 26,
                borderColor: errors.amount ? '#c0392b' : '#ddd',
              }}
            />
          </div>
        </Field>

        {/* Payee */}
        <Field label="Payee (who was paid)" required error={errors.payeeId}>
          <SearchableDropdownWithFreetext
            options={dropdowns?.payees || []}
            value={form.payeeName
              ? { id: form.payeeId, name: form.payeeName, displayName: form.payeeDisplayName }
              : null
            }
            placeholder="Search payee…"
            onSelect={handlePayeeSelect}
            renderOption={p => p.displayName || p.name}
            renderSelected={p => p.displayName || p.name}
            freetextLabel="Use as payee:"
          />
        </Field>

        {/* Category */}
        <Field label="Category" error={errors.category}>
          <SearchableDropdown
            options={dropdowns?.activeCategories || []}
            value={form.category
              ? {
                  code: form.category,
                  name: dropdowns?.activeCategories
                    .find(c => c.code === form.category)?.name,
                }
              : null
            }
            placeholder="Search category… (optional)"
            onSelect={handleCategorySelect}
            renderOption={c => c.name}
            renderSelected={c => c.name}
          />
        </Field>

        {/* Description */}
        <Field label="Description" error={errors.description}>
          <textarea
            placeholder={
              form.projectCode === GENERAL_PROJECT.code
                ? 'Project not listed — write the site address here e.g. 123 Orchard Road #05-01'
                : 'e.g. Tiles from ABC Hardware'
            }
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        </Field>

        {/* Receipts */}
        <Field label="Receipts" required error={errors.files}>

          {files.length > 0 && (
            <div style={{
              marginBottom: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {files.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#fff', border: '0.5px solid #ddd',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <span style={{
                    flex: 1, fontSize: 13, color: '#333',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.name}
                  </span>
                  <button
                    onClick={() => removeFile(f.id)}
                    style={{
                      fontSize: 16, color: '#999', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current.click()}
            style={{
              width: '100%', padding: '12px',
              border: '2px dashed #ddd', borderRadius: 10,
              background: '#fff', color: '#1D5C8F',
              fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>📎</span> Add receipt
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
        </Field>

        {/* Attachment progress */}
        {attachProgress.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{
              fontSize: 12, color: '#666',
              marginBottom: 8, fontWeight: 500,
            }}>
              Attaching receipts to Xero…
            </p>
            {attachProgress.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#fff', border: '0.5px solid #ddd',
                borderRadius: 8, padding: '8px 12px', marginBottom: 6,
              }}>
                <span style={{ fontSize: 16 }}>
                  {f.status === 'done'      ? '✅' :
                   f.status === 'uploading' ? '⏳' :
                   f.status === 'error'     ? '❌' : '📄'}
                </span>
                <span style={{
                  flex: 1, fontSize: 13, color: '#333',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {f.name}
                </span>
                <span style={{
                  fontSize: 11,
                  color:
                    f.status === 'done'      ? '#27ae60' :
                    f.status === 'uploading' ? '#e67e22' :
                    f.status === 'error'     ? '#c0392b' : '#999',
                }}>
                  {f.status === 'done'      ? 'Attached' :
                   f.status === 'uploading' ? 'Attaching…' :
                   f.status === 'error'     ? 'Failed' : 'Waiting'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Submit error */}
        {errors.submit && (
          <div style={{
            background: '#fdecea', border: '1px solid #f5c6cb',
            borderRadius: 10, padding: '10px 14px',
            color: '#c0392b', fontSize: 13, marginBottom: 16,
          }}>
            {errors.submit}
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={
            submitting ||
            attachProgress.some(
              f => f.status === 'uploading' || f.status === 'pending'
            )
          }
          style={{
            width: '100%',
            background: submitting ? '#ccc' : '#1D5C8F',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '15px', fontSize: 16, fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting
            ? attachProgress.length > 0
              ? `Attaching ${attachProgress.filter(f => f.status === 'done').length}/${attachProgress.length}…`
              : 'Submitting…'
            : 'Submit claim'
          }
        </button>

      </div>
    </main>
  );
}