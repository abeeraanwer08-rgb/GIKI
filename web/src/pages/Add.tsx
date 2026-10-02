import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { ScanType } from '../api/types';
import { Banner, Button, Modal, TextField } from '../components/ui';
import { CATEGORIES, categoryStyle, documentLabel } from '../lib/categories';
import { capitalize, formatMoney } from '../lib/format';
import { buildDraft, buildPayload, isInvoice, isStatement, sumItems, type Draft } from '../lib/review';
import { useToast } from '../components/ui';

const TYPES: { key: ScanType; label: string; icon: string; hint: string }[] = [
  { key: 'auto', label: 'Auto-detect', icon: '✨', hint: 'HissabAI works out what the document is.' },
  { key: 'receipt', label: 'Receipt', icon: '🧾', hint: 'Shop, restaurant or fuel receipt.' },
  { key: 'bank_statement', label: 'Bank statement', icon: '🏦', hint: 'Upload a PDF or the page photos. Every spending row becomes its own expense.' },
  { key: 'invoice', label: 'Invoice', icon: '📄', hint: 'A business invoice with line items, tax and a total. A PDF or several pages are fine.' },
  { key: 'utility_bill', label: 'Utility bill', icon: '⚡', hint: 'Electricity, gas, water or internet bill.' },
  { key: 'wallet_screenshot', label: 'Wallet', icon: '📱', hint: 'EasyPaisa or JazzCash transaction screenshot.' },
];

const STEPS = ['Uploading your file', 'Checking image quality', 'Reading the document with AI', 'Organising items and totals'];
const STATEMENT_STEPS = ['Uploading your files', 'Checking every page’s quality', 'Reading every page with AI', 'Checking totals and balances'];

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,application/pdf';
const MAX_FILES = 12;
const MULTI_PAGE: ScanType[] = ['bank_statement', 'invoice'];

type Picked = { file: File; url: string | null };  // url is null for PDFs (no thumbnail)
/** A row date is fine when empty (filed on the statement end date) or a real YYYY-MM-DD. */
const dateProblem = (value: unknown): boolean => typeof value === 'string' && value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value);
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

function uploadMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.code === 'unsupported_document') return 'This doesn’t look like a supported document. Pick the type yourself above and try again.';
    if (error.status === 400) {
      const page = (error.detail as { page?: number } | null)?.page;
      return `${page ? `Page ${page} is` : 'The image is'} too blurry, dark or small to read. Try a clearer, larger photo.`;
    }
    if (error.status === 422) {
      const d = error.detail as { error?: string; message?: string } | null;
      if (d?.message) return d.message;
      if (d?.error === 'Too many pages') return `That’s too many pages. The limit is ${MAX_FILES} per document.`;
      return 'That document type isn’t supported. Choose a different type and try again.';
    }
    return error.message;
  }
  return 'Something went wrong while reading your document.';
}

export default function Add() {
  const navigate = useNavigate();
  const toast = useToast();
  const [type, setType] = useState<ScanType>('auto');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'processing' | 'review'>('pick');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [recordId, setRecordId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [saved, setSaved] = useState<{ count: number; merchant: string; total: string; category: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Release thumbnail URLs when the picked set changes or the page closes.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = picked.flatMap((p) => (p.url ? [p.url] : []));
  }, [picked]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Walk through the progress steps while waiting, holding on the last one.
  useEffect(() => {
    if (phase !== 'processing') return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(id);
  }, [phase]);

  const choose = (incoming: FileList | File[] | null | undefined) => {
    const list = Array.from(incoming ?? []);
    if (!list.length) return;
    const usable = list.filter((f) => f.type.startsWith('image/') || isPdf(f));
    if (usable.length < list.length) setError('Please choose images (JPEG, PNG, WebP) or a PDF.');
    else setError(null);
    if (!usable.length) return;
    setPicked((current) => {
      const next = [...current, ...usable.map((file) => ({ file, url: isPdf(file) ? null : URL.createObjectURL(file) }))];
      const kept = next.slice(0, MAX_FILES);
      next.slice(MAX_FILES).forEach((p) => p.url && URL.revokeObjectURL(p.url));
      if (next.length > MAX_FILES) setError(`Up to ${MAX_FILES} files per document.`);
      return kept;
    });
  };

  const removePage = (index: number) =>
    setPicked((current) => {
      current[index]?.url && URL.revokeObjectURL(current[index].url!);
      return current.filter((_, i) => i !== index);
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files);
  };

  const analyse = async () => {
    if (!picked.length) return;
    setError(null);
    setStep(0);
    setPhase('processing');
    try {
      const response = await api.upload(picked.map((p) => p.file), type);
      const next = buildDraft(response);
      setDraft(next);
      setCategory(null);
      setRecordId(crypto.randomUUID());
      setMismatch(false);
      setSaveError(null);
      setPhase('review');
    } catch (e) {
      setError(uploadMessage(e));
      setPhase('pick');
    }
  };

  const statement = draft ? isStatement(draft.documentType) : false;
  const invoice = draft ? isInvoice(draft.documentType) : false;
  const multiType = MULTI_PAGE.includes(type);
  const steps = multiType ? STATEMENT_STEPS : STEPS;
  const total = useMemo(() => (draft ? (statement ? sumItems(draft.items, draft.currency) : draft.total) : ''), [draft, statement]);

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateItem = (index: number, patch: Partial<Draft['items'][number]>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) } : d));
  const removeItem = (index: number) =>
    setDraft((d) => (d && d.items.length > 1 ? { ...d, items: d.items.filter((_, i) => i !== index) } : d));

  const save = async (confirm = false) => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.save(buildPayload(draft, recordId, category, confirm));
      setSaved({ count: result.records_saved ?? 1, merchant: draft.merchant, total, category: result.category ?? null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (e.code === 'total_mismatch') setMismatch(true);
        else setSaveError('This has already been saved — no duplicate was created.');
      } else {
        setSaveError(e instanceof ApiError ? e.message : 'Could not save. Your edits are kept — please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPhase('pick');
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    setPicked([]);
    setDraft(null);
    setSaved(null);
    setMismatch(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const selected = TYPES.find((t) => t.key === type)!;
  const tooMany = picked.length > 1 && !multiType && type !== 'auto';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="faint">{phase === 'review' ? 'Check the details before saving' : 'Receipts, statements, bills and wallet screenshots'}</span>
          <h1>{phase === 'review' ? 'Review details' : 'Add expense'}</h1>
        </div>
        {phase === 'review' && <Button variant="ghost" onClick={reset}>Start over</Button>}
      </div>

      {phase === 'pick' && (
        <>
          <section className="card">
            <div className="card-title"><h3>What are you adding?</h3></div>
            <div className="chips" role="group" aria-label="Document type">
              {TYPES.map((t) => (
                <button key={t.key} className="chip" aria-pressed={t.key === type} onClick={() => setType(t.key)}>
                  <span aria-hidden="true">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 12 }}>{selected.hint}</p>
          </section>

          {error && <Banner tone="danger">⚠️ {error}</Banner>}

          {tooMany && (
            <Banner tone="warn">⚠️ Several files are only supported for bank statements and invoices. Choose that type above, or keep a single page.</Banner>
          )}

          <div
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {picked.length ? (
              <>
                <div className="pages" role="list" aria-label="Selected pages">
                  {picked.map((p, i) => (
                    <div className="page-thumb" role="listitem" key={`${p.file.name}-${i}`}>
                      {p.url ? <img src={p.url} alt={`Page ${i + 1}`} /> : <div className="pdf" aria-hidden="true">📄<b>PDF</b></div>}
                      <span className="n">{i + 1}</span>
                      <button className="x" onClick={() => removePage(i)} aria-label={`Remove ${p.file.name}`}>✕</button>
                    </div>
                  ))}
                </div>
                <b>{picked.length === 1 ? picked[0].file.name : `${picked.length} files`}</b>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button onClick={analyse} disabled={tooMany}>Analyse with AI</Button>
                  {(multiType || type === 'auto') && picked.length < MAX_FILES && !picked.some((p) => isPdf(p.file)) && (
                    <Button variant="secondary" onClick={() => inputRef.current?.click()}>Add another page</Button>
                  )}
                  <Button variant="ghost" onClick={() => inputRef.current?.click()}>
                    {multiType ? 'Add more files' : 'Choose a different file'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="glyph" aria-hidden="true">⬆</div>
                <h3>Drop {multiType ? 'a PDF or page images' : 'an image'} here</h3>
                <p className="muted">or choose {multiType ? 'files' : 'one'} from your computer or phone. Photos from your camera work too.</p>
                <Button onClick={() => inputRef.current?.click()}>Choose {multiType ? 'files' : 'image'}</Button>
                <span className="faint" style={{ fontSize: 13 }}>JPEG, PNG, WebP or PDF · up to 10 MB each · up to {MAX_FILES} pages</span>
              </>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { choose(e.target.files); e.target.value = ''; }} aria-label="Choose files" />
          </div>
        </>
      )}

      {phase === 'processing' && (
        <section className="card" style={{ maxWidth: 520, marginInline: 'auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div className="spinner" style={{ width: 38, height: 38, color: 'var(--primary)', borderWidth: 4 }} />
            <h3 style={{ marginTop: 16 }}>{type === 'bank_statement' ? 'Analysing your statement' : 'Analysing your document'}</h3>
            <p className="muted">{type === 'bank_statement' ? 'Statements can take up to a minute.' : 'This usually takes a few seconds.'}</p>
          </div>
          <div className="steps-list" aria-live="polite">
            {steps.map((label, i) => (
              <div key={label} className={`s${i === step ? ' active' : i < step ? ' done' : ''}`}>
                <span aria-hidden="true">{i < step ? '✅' : i === step ? '⏳' : '⚪'}</span>{label}
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === 'review' && draft && (
        <div className="review-grid">
          <aside className="card sticky">
            {picked[0]?.url ? <img className="preview" src={picked[0].url} alt="Scanned document" /> : <div className="preview pdf-big" aria-hidden="true">📄 PDF</div>}
            {picked.length > 1 && <p className="faint" style={{ marginTop: 8, fontSize: 13 }}>{picked.length} pages</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <span className="pill pill-info">{documentLabel(draft.documentType)}</span>
              {draft.confidence !== null && (
                <span className={`pill ${draft.confidence >= 0.8 ? 'pill-ok' : draft.confidence >= 0.6 ? 'pill-warn' : 'pill-bad'}`}>
                  {draft.confidence >= 0.8 ? 'High' : draft.confidence >= 0.6 ? 'Medium' : 'Low'} confidence · {Math.round(draft.confidence * 100)}%
                </span>
              )}
            </div>
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>AI extracted these details. Check them before saving.</p>
          </aside>

          <div style={{ display: 'grid', gap: 18 }}>
            {draft.hints.length > 0 && (
              <Banner tone="warn">
                <div><b>Worth a second look</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{draft.hints.map((h) => <li key={h}>{h}</li>)}</ul></div>
              </Banner>
            )}

            <section className="card">
              <div className="card-title"><h3>Details</h3><span className="faint">Click any field to correct it</span></div>
              <div className="form-grid">
                <TextField label={statement ? 'Bank' : invoice ? 'Vendor' : 'Merchant'} value={draft.merchant} onChange={(v) => update({ merchant: v })} />
                <TextField label={statement ? 'Statement end date' : invoice ? 'Invoice date' : 'Date'} value={draft.date} onChange={(v) => update({ date: v })} placeholder="YYYY-MM-DD" />
                <TextField
                  label={statement ? 'Total spent (sum of the rows below)' : invoice ? 'Invoice total' : 'Total paid'}
                  value={total} readOnly={statement}
                  onChange={(v) => update({ total: v })}
                />
              </div>
            </section>

            {statement ? (
              <Banner tone="info">
                <span>🏦 <b>Categorised row by row.</b> Each spending row is filed under its own category. Remove any row that isn’t spending, such as a transfer between your own accounts.</span>
              </Banner>
            ) : (
              <section className="card">
                <div className="card-title"><h3>Category</h3><span className="faint">Auto-detect uses the merchant and items</span></div>
                <div className="chips" role="group" aria-label="Category">
                  <button className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>✨ Auto-detect</button>
                  {CATEGORIES.map((c) => (
                    <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                      <span aria-hidden="true">{categoryStyle(c).emoji}</span>{capitalize(c)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {draft.items.length > 0 && (
              <section className="card">
                <div className="card-title">
                  <h3>{statement ? 'Spending transactions' : 'Items'}</h3>
                  <span className="faint">{statement ? `${draft.items.length} debit${draft.items.length === 1 ? '' : 's'} · money in is not counted` : `${draft.items.length} line item${draft.items.length === 1 ? '' : 's'}`}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        {statement && <th className="hide-sm">Date</th>}
                        <th>{statement ? 'Description' : 'Item'}</th>
                        {statement && <th className="hide-sm">Category</th>}
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        {statement && <th aria-label="Remove" />}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((item, i) => (
                        <tr key={i}>
                          {statement && (
                            <td className="hide-sm" style={{ width: 130 }}>
                              <input
                                className={`input date-input${dateProblem(item.metadata.date) ? ' invalid' : ''}`}
                                value={typeof item.metadata.date === 'string' ? item.metadata.date : ''}
                                onChange={(e) => updateItem(i, { metadata: { ...item.metadata, date: e.target.value, date_inferred: undefined } })}
                                placeholder="YYYY-MM-DD" maxLength={10} aria-label={`Item ${i + 1} date`}
                                title={item.metadata.date_inferred ? 'This date was not printed; it was copied from the previous row.' : undefined}
                              />
                              {item.metadata.date_inferred === true && !dateProblem(item.metadata.date) && <span className="assumed">assumed</span>}
                            </td>
                          )}
                          <td><input className="input" value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} aria-label={`Item ${i + 1} description`} /></td>
                          {statement && (
                            <td className="hide-sm">
                              <select className="input" value={item.category ?? 'other'} onChange={(e) => updateItem(i, { category: e.target.value })} aria-label={`Item ${i + 1} category`}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
                              </select>
                            </td>
                          )}
                          <td style={{ width: 130 }}><input className="input num" style={{ textAlign: 'right' }} value={item.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} aria-label={`Item ${i + 1} amount`} /></td>
                          {statement && (
                            <td style={{ width: 44 }}>
                              {draft.items.length > 1 && <button className="icon-btn" onClick={() => removeItem(i)} aria-label={`Remove ${item.description || 'item'}`}>✕</button>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {invoice && draft.details && (
              <section className="card">
                <div className="card-title"><h3>Invoice details</h3></div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {draft.details.invoice_number ? <Row k="Invoice no." v={String(draft.details.invoice_number)} /> : null}
                  {draft.details.due_date ? <Row k="Due date" v={String(draft.details.due_date)} /> : null}
                  {draft.details.payment_terms ? <Row k="Terms" v={String(draft.details.payment_terms)} /> : null}
                  {draft.details.vendor_tax_id ? <Row k="Vendor NTN/STRN" v={String(draft.details.vendor_tax_id)} /> : null}
                  {draft.extras.tax_amount !== null ? <Row k="Tax" v={formatMoney(draft.extras.tax_amount, draft.currency)} /> : null}
                  {draft.extras.discount_amount ? <Row k="Discount" v={`− ${formatMoney(draft.extras.discount_amount, draft.currency)}`} /> : null}
                  {draft.extras.delivery_charge ? <Row k="Shipping" v={formatMoney(draft.extras.delivery_charge, draft.currency)} /> : null}
                </div>
              </section>
            )}

            {statement && draft.details && (
              <section className="card">
                <div className="card-title"><h3>Statement summary</h3></div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <Row k="Period" v={`${String(draft.details.period_start ?? '—')} → ${String(draft.details.period_end ?? '—')}`} />
                  {draft.details.account_last4 ? <Row k="Account" v={`•••• ${String(draft.details.account_last4)}`} /> : null}
                  {typeof draft.details.total_credits === 'number' && (
                    <Row k={`Money in (${String(draft.details.credit_count ?? 0)})`} v={formatMoney(draft.details.total_credits, draft.currency)} />
                  )}
                  <Row k="Total spent" v={total} strong />
                </div>
              </section>
            )}

            {saveError && <Banner tone="danger">⚠️ {saveError}</Banner>}
            {mismatch && (
              <Banner tone="warn">
                <div>
                  <b>The amounts don’t fully match.</b> The item amounts don’t reconcile with the final total. This can be caused by GST, service charges, discounts, rounding, or an extraction error.
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button small variant="ghost" onClick={() => setMismatch(false)}>Review amounts</Button>
                    <Button small variant="danger" loading={saving} onClick={() => save(true)}>Save anyway</Button>
                  </div>
                </div>
              </Banner>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button loading={saving} onClick={() => save(false)}>Save expense</Button>
            </div>
          </div>
        </div>
      )}

      {saved && (
        <Modal title="Saved" onClose={() => navigate('/app/transactions')}>
          <div style={{ textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div className="glyph" style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--gradient)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 40 }}>✓</div>
            <h2 style={{ fontSize: 26 }}>{saved.count > 1 ? `${saved.count} expenses saved` : 'Expense saved'}</h2>
            <p className="muted">{saved.merchant ? `${saved.merchant} · ${saved.total}` : saved.total}</p>
            <p className="pill pill-ok" style={{ height: 'auto', padding: '8px 14px' }}>
              {saved.count > 1 ? 'Each transaction filed under its own category' : `Filed under ${capitalize(saved.category ?? 'other')}`}
            </p>
            <Button block onClick={() => { toast('Saved'); navigate('/app'); }}>Go to dashboard</Button>
            <Button block variant="ghost" onClick={reset}>Add another</Button>
            <Link to="/app/transactions">View transactions</Link>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: strong ? 750 : 500, color: strong ? 'var(--primary-dark)' : undefined, borderTop: strong ? '1px dashed var(--border)' : undefined, paddingTop: strong ? 10 : 0 }}>
      <span className={strong ? '' : 'muted'}>{k}</span><span className="num">{v}</span>
    </div>
  );
}
