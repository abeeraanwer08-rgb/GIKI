import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

const FEATURES = [
  { ico: '🧾', title: 'Scan anything', body: 'Receipts, bank statements, utility bills and EasyPaisa / JazzCash screenshots. Take a photo or upload one — the AI reads it for you.' },
  { ico: '🏦', title: 'Bank statements, row by row', body: 'Every spending row becomes its own expense with its own category, and totals and running balances are checked before you save.' },
  { ico: '🎯', title: 'Budgets that warn you', body: 'Set a monthly limit per category and see at a glance what is on track, close to the limit, or over.' },
  { ico: '📈', title: 'Forecasts and unusual spending', body: 'See where the month is heading and get flagged when a purchase is far above what is normal for its category.' },
  { ico: '💬', title: 'Ask in English or Urdu', body: 'Ask “is mahine kitna kharcha hua?” and get an answer grounded only in your own numbers.' },
  { ico: '🔒', title: 'Private by design', body: 'Every account sees only its own data. Passwords are hashed and the AI never invents figures — all totals are computed in code.' },
];

const STEPS = [
  { t: 'Add a document', b: 'Photograph it or upload an image of a receipt, bill or statement page.' },
  { t: 'AI reads it', b: 'Merchant, date, items and totals are extracted in seconds.' },
  { t: 'You check it', b: 'Correct anything the AI got wrong. Totals are verified for you.' },
  { t: 'Understand your money', b: 'Dashboards, budgets, forecasts and a chat assistant update instantly.' },
];

const MOCK_BARS = ['#6ee7b7', '#fdba74', '#fcd34d', '#93c5fd'];

export default function Landing() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const cta = signedIn ? { to: '/app', label: 'Open dashboard' } : { to: '/signup', label: 'Get started free' };

  return (
    <>
      <header className="nav">
        <div className="container nav-in">
          <Link to="/" className="brand"><Logo /> <span className="brand-text">HissabAI</span></Link>
          <nav className="nav-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#statements">Bank statements</a>
          </nav>
          <span className="spacer" />
          {!signedIn && <Link to="/signin" className="btn btn-ghost btn-sm">Sign in</Link>}
          <Link to={cta.to} className="btn btn-primary btn-sm">{cta.label}</Link>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="tag">✨ AI money copilot for Pakistan</span>
            <h1>Your receipts and statements, turned into clear answers.</h1>
            <p className="lead">
              HissabAI reads your receipts, bills and bank statements, files every expense under the right category, and
              tells you where your money is going — in English and Urdu.
            </p>
            <div className="hero-cta">
              <Link to={cta.to} className="btn btn-light">{cta.label}</Link>
              <a href="#how" className="btn btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }}>See how it works</a>
            </div>
            <div className="hero-stats">
              <div><strong>4</strong><span>document types</span></div>
              <div><strong>9</strong><span>smart categories</span></div>
              <div><strong>EN · اردو</strong><span>ask in either</span></div>
            </div>
          </div>

          <div className="phone" aria-hidden="true">
            <div className="phone-screen">
              <div className="mock-hero">
                <div style={{ fontSize: 11, letterSpacing: '.09em', opacity: .7 }}>SPENT THIS MONTH</div>
                <div className="amount">PKR 53,624</div>
                <div className="mock-bar">
                  {[34, 28, 22, 16].map((w, i) => <span key={i} style={{ width: `${w}%`, background: MOCK_BARS[i] }} />)}
                </div>
              </div>
              {[
                ['🛒', 'Imtiaz Super Market', 'Groceries', '5,120'],
                ['⚡', 'K-Electric', 'Utilities', '6,200'],
                ['🍽️', 'Cafe Flo', 'Restaurant', '1,850'],
              ].map(([e, n, c, a]) => (
                <div className="mock-row" key={n}>
                  <span className="cat-badge" style={{ background: '#f1f4f7', width: 34, height: 34, fontSize: 15 }}>{e}</span>
                  <span><b>{n}</b><span className="faint">{c}</span></span>
                  <span className="amt">PKR {a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <span className="overline">Features</span>
            <h2>Everything you need to stay on top of your spending</h2>
            <p>Built for how people in Pakistan actually pay — cash receipts, wallets, bills and bank transfers.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <article className="card feature" key={f.title}>
                <div className="ico" aria-hidden="true">{f.ico}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="overline">How it works</span>
            <h2>From a photo to a full picture in four steps</h2>
          </div>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.t}><h3>{s.t}</h3><p>{s.b}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="statements" style={{ paddingTop: 0 }}>
        <div className="container split">
          <div>
            <span className="overline">New</span>
            <h2>Bank statements that check themselves</h2>
            <p className="muted" style={{ marginTop: 12, fontSize: 17 }}>
              Upload a statement page and HissabAI extracts every transaction, then verifies the maths before anything is saved.
            </p>
            <ul className="checklist">
              <li>Each spending row becomes its own expense, filed under its own category.</li>
              <li>Printed totals and running balances are cross-checked; mismatches are flagged.</li>
              <li>Remove rows that are not spending, such as transfers between your own accounts.</li>
              <li>Only the last four digits of your account number are ever kept.</li>
              <li>Saving the same statement twice never double-counts.</li>
            </ul>
          </div>
          <div className="card stmt" aria-hidden="true">
            <div className="stmt-head"><b>Habib Bank Limited</b><span style={{ opacity: .8, fontSize: 13 }}>Sep 2026</span></div>
            {[
              ['03 Sep', 'Imtiaz Super Market', '−5,120'],
              ['05 Sep', 'K-Electric Bill Payment', '−6,200'],
              ['08 Sep', 'Careem Ride', '−950'],
              ['10 Sep', 'Cafe Flo', '−1,850'],
              ['12 Sep', 'Daraz Online Order', '−4,300'],
            ].map(([d, n, a]) => (
              <div className="stmt-row" key={n}><span className="faint">{d}</span><span>{n}</span><b className="num">{a}</b></div>
            ))}
            <div className="stmt-foot"><span>✓ Totals verified</span><span className="num">PKR 18,420</span></div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta">
            <h2>Start understanding your spending today</h2>
            <p>Create a free account and add your first receipt in under a minute.</p>
            <Link to={cta.to} className="btn btn-light">{cta.label}</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-in">
          <span className="brand" style={{ fontSize: 16 }}><Logo size={28} /> HissabAI</span>
          <span>A university AI project. Built on the KharchAI codebase with its authors’ permission.</span>
        </div>
      </footer>
    </>
  );
}
