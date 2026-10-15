// Screen 3: Expense form + receipt upload

'use client';
import { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/session';
import {
  GENERAL_PROJECT, UNLINKED_PROJECT, DEFAULT_PAYEE, RECEIPT_STATUSES,
  RECEIPTED_COST_TYPES, DEFAULT_RECEIPTED_COST_TYPE,
} from '@/lib/constants';
import dynamic from 'next/dynamic';

const PdfViewer = dynamic(() => import('@/app/components/PdfViewer'), { ssr: false });

// ── File type helpers ─────────────────────────────────────────────────────────
const ACCEPTED_RECEIPT_TYPES = 'image/*,application/pdf';
const isImage      = type => type.startsWith('image/');
const isPdf        = type => type === 'application/pdf';
const isPreviewable = type => isImage(type) || isPdf(type);

// ── Pointer capability ────────────────────────────────────────────────────────
// Dragging a file needs a mouse, so the drop hint is only worth showing there.
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const hasFinePointer = () => window.matchMedia(FINE_POINTER).matches;
function subscribeToPointer(onChange) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

// ── Shared hover handlers for dropdown list items ─────────────────────────────
const hoverOn  = e => { e.currentTarget.style.background = '#f0f4f8'; };
const hoverOff = e => { e.currentTarget.style.background = 'transparent'; };

// ── Autofocus the search box when a dropdown opens ────────────────────────────
// Deliberately a layout effect: iOS only raises the on-screen keyboard for a focus()
// that runs inside the task of the gesture that opened the panel. Layout effects commit
// synchronously within the click, so the keyboard comes up; a passive useEffect is
// flushed later and iOS silently focuses without showing the keyboard.
function useAutofocusOnOpen(open) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  return ref;
}

function getInitialForm() {
  return {
    date:             new Date().toISOString().split('T')[0],
    projectCode:      '',
    projectAddress:   '',
    amount:           '',
    payeeDisplayName: DEFAULT_PAYEE.displayName || '',
    payeeId:          DEFAULT_PAYEE.id          || '',
    payeeName:        DEFAULT_PAYEE.name        || '',
    payeeType:        DEFAULT_PAYEE.type        || '',
    category:         '',
    costType:         DEFAULT_RECEIPTED_COST_TYPE,
    description:      '',
  };
}

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

// Vercel caps a serverless request body at 4.5 MB, and /api/attach buffers the whole
// file in memory before PUTing it to Xero. A modern phone photo is 5–12 MB, so it has
// to be downscaled first or the upload fails with an opaque error. Kept under the cap
// with headroom for the multipart envelope.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// compressImage always re-encodes as JPEG, so a .png/.heic name would misdescribe the
// bytes — Xero takes the filename and content type at face value.
function jpegName(name) {
  return `${name.replace(/\.[^.]+$/, '')}.jpg`;
}

// Images are downscaled; anything else (PDFs) is passed through untouched.
// compressImage resolves with the original File if decoding fails, so an identity
// check tells us whether compression actually happened.
async function prepareForUpload(file) {
  if (!isImage(file.type)) return { blob: file, name: file.name };
  const blob = await compressImage(file);
  return blob === file
    ? { blob: file, name: file.name }
    : { blob, name: jpegName(file.name) };
}

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Description helper pills ──────────────────────────────────────────────────
// Descriptions are written on a phone, on site, and follow a house pattern:
// "<trade> <material|labour> <date>", e.g. "Electrical material 06/09/26". These append
// the pieces on one tap each so the whole line can be built without the keyboard.

// The date the pill inserts. Deliberately dd/mm/yy, matching how the dates are already
// written by hand in the workbook's descriptions ("canvas for water test - 280526"),
// NOT the ISO form the date field holds.
function toDdMmYy(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function HelperPill({ label, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        padding: '6px 12px', borderRadius: 999,
        border: '1px solid #cfe0ee', background: '#f2f7fb',
        color: '#1D5C8F', fontSize: 13, lineHeight: 1.2,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      + {label}
    </button>
  );
}

// One-of-few choice shown as joined buttons. Every option stays visible, so the default
// is seen and changed in one tap — a dropdown would hide that "Material" was preselected.
function ChoiceGroup({ options, value, onChange }) {
  return (
    <div role="radiogroup" style={{ display: 'flex', gap: 6 }}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, minWidth: 0, padding: '11px 6px', borderRadius: 10,
              border: `1px solid ${selected ? '#1D5C8F' : '#ddd'}`,
              background: selected ? '#f2f7fb' : '#fff',
              color: selected ? '#1D5C8F' : '#555',
              fontSize: 14, fontWeight: selected ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
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

// ── Clearable input — shows an × to wipe the field while it's focused ────────
function ClearableInput({
  type = 'text', value, onChange, placeholder, prefix, style,
  fontSize = 14, vPadding = 8, prefixLeft = 10, borderColor = '#eee',
}) {
  const [focused, setFocused] = useState(false);
  const showClear = focused && value;
  const hPadding = 10;

  return (
    <div style={{ position: 'relative', ...style }}>
      {prefix && (
        <span style={{
          position: 'absolute', left: prefixLeft, top: '50%',
          transform: 'translateY(-50%)', color: '#999', fontSize: fontSize - 1,
        }}>{prefix}</span>
      )}
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', fontSize, boxSizing: 'border-box',
          padding: `${vPadding}px ${showClear ? 26 : hPadding}px ${vPadding}px ${prefix ? prefixLeft + 12 : hPadding}px`,
          border: `1px solid ${borderColor}`, borderRadius: 8,
          background: '#fff', color: '#1a1a1a',
        }}
      />
      {showClear && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange(''); }}
          style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)', fontSize: 14, color: '#999',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', fontSize: 16, padding: '11px 13px',
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
  const searchRef         = useAutofocusOnOpen(open);

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
              ref={searchRef}
              type="text"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', fontSize: 16, padding: '7px 10px',
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
                  onMouseEnter={hoverOn}
                  onMouseLeave={hoverOff}
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
  const searchRef         = useAutofocusOnOpen(open);

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
              ref={searchRef}
              type="text"
              placeholder="Search or type a name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', fontSize: 16, padding: '7px 10px',
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
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
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
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
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
  const fileInputRef  = useRef();
  const objectUrlsRef = useRef([]);

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

  const [form, setForm] = useState(getInitialForm);

  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null); // { url, type } | null
  // Each file: { id, file, name, type, status: 'ready', previewUrl: string|null }

  // Explicit "there is no receipt" declaration — only reachable while files is empty.
  const [noReceipt, setNoReceipt] = useState(false);

  const [extraItems, setExtraItems] = useState([]);
  // Each extra item: { id, description, amount }

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

  /**
   * Append a word to the description, one pill tap at a time.
   *
   * Leaves a trailing space so tapping two pills in a row, or carrying on with the
   * keyboard, does not run the words together. The description is trimmed on submit so
   * that space never reaches the sheet.
   */
  function appendToDescription(text) {
    setForm(prev => {
      const current = prev.description.trimEnd();
      return { ...prev, description: current ? `${current} ${text} ` : `${text} ` };
    });
    setErrors(prev => ({ ...prev, description: '' }));
  }

  // ── Project options — General first, sheet projects after, no duplicates ───
  const projectOptions = dropdowns ? [
    GENERAL_PROJECT,
    ...dropdowns.activeProjects.filter(p => p.code !== GENERAL_PROJECT.code),
  ] : [];

  // Display name for the chosen category, e.g. 'Electrical'. Empty until one is picked.
  const selectedCategoryName = form.category
    ? (dropdowns?.activeCategories.find(c => c.code === form.category)?.name ?? '')
    : '';

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

  function addFiles(picked) {
    // The file input is limited by its accept list, but a drop carries anything the
    // desktop can drag, so the type check has to happen here too.
    const wrongType = picked.filter(f => !isPreviewable(f.type));

    // Images get downscaled before upload, so only pass-through files (PDFs) can
    // still breach the limit. Catch them here rather than after a Xero bill exists.
    const tooBig = picked.filter(f => !isImage(f.type) && f.size > MAX_UPLOAD_BYTES);
    const rejected = new Set([...wrongType, ...tooBig]);
    const accepted = picked.filter(f => !rejected.has(f));

    const newFiles = accepted.map(file => {
      const previewUrl = isPreviewable(file.type) ? URL.createObjectURL(file) : null;
      if (previewUrl) objectUrlsRef.current.push(previewUrl);
      return { id: `${Date.now()}_${Math.random()}`, file, name: file.name, type: file.type, status: 'ready', previewUrl };
    });
    setFiles(prev => [...prev, ...newFiles]);
    // Clear the declaration: the checkbox unmounts once files exist, but leaving the
    // state set would record declared_none on a claim that does have a receipt.
    if (newFiles.length > 0) setNoReceipt(false);

    const messages = [];
    if (tooBig.length > 0) {
      messages.push(`${tooBig.map(f => f.name).join(', ')} — too large to upload (max 4 MB). Photograph the receipt instead.`);
    }
    if (wrongType.length > 0) {
      messages.push(`${wrongType.map(f => f.name).join(', ')} — only images and PDFs can be attached.`);
    }
    setErrors(prev => ({ ...prev, files: messages.join(' ') }));
  }

  function handleFilePick(e) {
    addFiles(Array.from(e.target.files));
    e.target.value = '';
  }

  // ── Drag and drop (desktop browsers; these events never fire on touch) ───────
  // dragenter/dragleave also fire when the pointer crosses the drop zone's own
  // children, so a plain boolean flickers. Counting enters against leaves doesn't.
  const dragDepth = useRef(0);

  function handleDragEnter(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    // Without this the browser navigates to the dropped file instead of handing it over.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (dropped.length > 0) addFiles(dropped);
  }

  function removeFile(id) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  // The default description carries the same date and trade the pills append to the
  // main description, so a transport line reads the same way on the sheet. Filled in
  // from the form as it stands when the row is added and then left alone: it is an
  // editable field, and re-deriving it would wipe whatever was typed over it.
  function addExtraItem() {
    const description = ['WL Transport', toDdMmYy(form.date), selectedCategoryName]
      .filter(Boolean)
      .join(' ');
    setExtraItems(prev => [
      ...prev,
      { id: `${Date.now()}_${Math.random()}`, description, amount: '50' },
    ]);
  }

  function updateExtraItem(id, key, value) {
    setExtraItems(prev => prev.map(item => item.id === id ? { ...item, [key]: value } : item));
  }

  function removeExtraItem(id) {
    setExtraItems(prev => prev.filter(item => item.id !== id));
  }

  // Only mention dropping where there is a mouse to drag with. The server snapshot is
  // false, so the first client paint matches the markup and hydration stays quiet.
  const canDrop = useSyncExternalStore(subscribeToPointer, hasFinePointer, () => false);

  // Revoke all blob URLs on unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

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
    if (files.length === 0 && !noReceipt) {
      e.files = 'Attach a receipt, or tick "I don\'t have a receipt"';
    }
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
          // Pills append a trailing space so the next tap or keystroke reads cleanly;
          // it must not reach the sheet.
          description: form.description.trim(),
          submittedBy: user.name,
          receiptStatus: files.length > 0
            ? RECEIPT_STATUSES.ATTACHED
            : RECEIPT_STATUSES.DECLARED_NONE,
          extraLineItems: extraItems.map(({ description, amount }) => ({ description, amount })),
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

      // Downscale once, up front — reused for the upload and the share-sheet copy below.
      const prepared = await Promise.all(files.map(f => prepareForUpload(f.file)));

      for (let i = 0; i < files.length; i++) {
        setAttachProgress(prev =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'uploading' } : p
          )
        );

        try {
          const { blob, name } = prepared[i];

          if (blob.size > MAX_UPLOAD_BYTES) {
            setAttachProgress(prev =>
              prev.map((p, idx) =>
                idx === i ? { ...p, status: 'error', reason: 'Too large' } : p
              )
            );
            continue;
          }

          const body = new FormData();
          // Third argument sets the multipart filename — without it the blob arrives
          // at the server named "blob" and Xero stores the attachment under that.
          body.append('file',       blob, name);
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
        category:       selectedCategoryName,
        xeroBillId,
      }));

      // Store compressed receipt files for share sheet — best-effort, text-only share if quota exceeded
      sessionStorage.removeItem('lastExpenseFiles');
      try {
        const stored = await Promise.all(prepared.map(async ({ blob, name }, i) => {
          const buf = await blob.arrayBuffer();
          return { name, type: blob.type || files[i].file.type, data: bufToBase64(buf) };
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
    // The drop handlers sit on the whole page, not just the button: a file dropped on
    // any other part of the window makes the browser navigate to it and lose the form.
    <main
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ minHeight: '100svh', background: '#f8f9fa', paddingBottom: '2rem' }}
    >

      {/* Receipt preview modal */}
      {preview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex',
            // PDFs fill the viewport; images stay centred
            ...(isPdf(preview.type)
              ? { flexDirection: 'column' }
              : { alignItems: 'center', justifyContent: 'center' }
            ),
          }}
        >
          {isPdf(preview.type) ? (
            <PdfViewer url={preview.url} />
          ) : (
            <img
              src={preview.url}
              alt="Receipt preview"
              onClick={() => setPreview(null)}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
          <button
            onClick={() => setPreview(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: 22, width: 40, height: 40,
              borderRadius: '50%', cursor: 'pointer', lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

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
        <button
          onClick={() => router.push('/home')}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0,
          }}
        ><img src="/home.svg" alt="Home" style={{ width: 22, height: 22, display: 'block', filter: 'invert(1)' }} /></button>
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
                  {f.previewUrl ? (
                    isPdf(f.type) ? (
                      <div
                        onClick={() => setPreview({ url: f.previewUrl, type: f.type })}
                        style={{
                          width: 48, height: 48, borderRadius: 6, flexShrink: 0,
                          cursor: 'zoom-in', background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>PDF</span>
                      </div>
                    ) : (
                      <img
                        src={f.previewUrl}
                        alt="Receipt thumbnail"
                        onClick={() => setPreview({ url: f.previewUrl, type: f.type })}
                        style={{
                          width: 48, height: 48, objectFit: 'cover',
                          borderRadius: 6, flexShrink: 0, cursor: 'zoom-in',
                        }}
                      />
                    )
                  ) : (
                    <span style={{ fontSize: 18 }}>📄</span>
                  )}
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
              border: `2px dashed ${dragging ? '#1D5C8F' : '#ddd'}`, borderRadius: 10,
              background: dragging ? '#eef4fa' : '#fff', color: '#1D5C8F',
              fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>{dragging ? '📥' : '📎'}</span>
            {dragging
              ? 'Drop to attach'
              : canDrop ? 'Add receipt, or drop files anywhere' : 'Add receipt'}
          </button>

          {files.length === 0 && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 10, fontSize: 13, color: '#666', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={noReceipt}
                onChange={e => {
                  setNoReceipt(e.target.checked);
                  setErrors(prev => ({ ...prev, files: '' }));
                }}
                style={{ width: 16, height: 16, flexShrink: 0, accentColor: '#1D5C8F' }}
              />
              I don&apos;t have a receipt for this expense
            </label>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_RECEIPT_TYPES}
            multiple
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
        </Field>

        {/* Amount */}
        <Field label="Amount (SGD)" required error={errors.amount}>
          <ClearableInput
            type="number"
            prefix="$"
            placeholder="0.00"
            value={form.amount}
            onChange={val => setField('amount', val)}
            fontSize={16}
            vPadding={11}
            prefixLeft={13}
            borderColor={errors.amount ? '#c0392b' : '#ddd'}
          />
        </Field>

        {/* Category */}
        <Field label="Category" error={errors.category}>
          <SearchableDropdown
            options={dropdowns?.activeCategories || []}
            value={form.category
              ? { code: form.category, name: selectedCategoryName }
              : null
            }
            placeholder="Search category… (optional)"
            onSelect={handleCategorySelect}
            renderOption={c => c.name}
            renderSelected={c => c.name}
          />
        </Field>

        {/* Type — what the money paid for; splits a job's cost in projects-pwa */}
        <Field label="Type">
          <ChoiceGroup
            options={RECEIPTED_COST_TYPES}
            value={form.costType}
            onChange={value => setField('costType', value)}
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

          {/* Tap-to-append shortcuts. The trade pill only appears once a category is
              chosen — there is no word to insert before that. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8,
          }}>
            {selectedCategoryName && (
              <HelperPill
                label={selectedCategoryName}
                onTap={() => appendToDescription(selectedCategoryName)}
              />
            )}
            <HelperPill label="material" onTap={() => appendToDescription('material')} />
            <HelperPill label="labour"   onTap={() => appendToDescription('labour')} />
            {toDdMmYy(form.date) && (
              <HelperPill
                label={toDdMmYy(form.date)}
                onTap={() => appendToDescription(toDdMmYy(form.date))}
              />
            )}
          </div>
        </Field>

        {/* Extra line items */}
        <Field label="Extra items (optional)">
          {extraItems.length > 0 && (
            <div style={{
              marginBottom: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {extraItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#fff', border: '0.5px solid #ddd',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <ClearableInput
                    value={item.description}
                    onChange={val => updateExtraItem(item.id, 'description', val)}
                    placeholder="Description"
                    style={{ flex: 1 }}
                  />
                  <ClearableInput
                    type="number"
                    prefix="$"
                    value={item.amount}
                    onChange={val => updateExtraItem(item.id, 'amount', val)}
                    style={{ width: 100, flexShrink: 0 }}
                  />
                  <button
                    onClick={() => removeExtraItem(item.id)}
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
            onClick={addExtraItem}
            style={{
              width: '100%', padding: '12px',
              border: '2px dashed #ddd', borderRadius: 10,
              background: '#fff', color: '#1D5C8F',
              fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>➕</span> Add extra expense (default: transport)
          </button>
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
                   f.status === 'error'     ? (f.reason || 'Failed') : 'Waiting'}
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
            : files.length === 0 && noReceipt
              ? 'Submit without receipt'
              : 'Submit claim'
          }
        </button>

        <button
          type="button"
          onClick={() => { setForm(getInitialForm()); setFiles([]); setNoReceipt(false); setExtraItems([]); setErrors({}); setAttachProgress([]); }}
          disabled={submitting}
          style={{
            width: '100%', marginTop: 10,
            background: 'none', color: '#999',
            border: '1px solid #ddd', borderRadius: 12,
            padding: '13px', fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Reset form
        </button>

      </div>
    </main>
  );
}