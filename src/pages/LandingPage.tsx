import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Files,
  GitBranch,
  Menu,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { useState } from 'react';

const executiveBenefits = [
  {
    icon: FileCheck2,
    eyebrow: 'Governance',
    title: 'Every approval, visible',
    description: 'Know what is pending, who owns the next decision, and how long it has been waiting.',
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'Workforce',
    title: 'Control casual labour spend',
    description: 'Compare approved vendors, automate lowest-price selection, and keep quality accountable.',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Assurance',
    title: 'Always audit-ready',
    description: 'A complete activity trail for documents, signatures, vendor changes, budgets, and approvals.',
  },
];

const modules = [
  { icon: Files, title: 'Document control', text: 'One governed home for hotel policies, SOPs, contracts, and records.' },
  { icon: GitBranch, title: 'Approval workflows', text: 'Department-aware routes with clear owners, comments, and revision cycles.' },
  { icon: UsersRound, title: 'Casual workforce', text: 'From department request to vendor assignment, execution, and quality review.' },
  { icon: BarChart3, title: 'Executive reporting', text: 'Spend, workload, vendor exposure, and department activity in one view.' },
];

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f4ee] text-[#102235]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#102235]/10 bg-[#f6f4ee]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="HOTERRA home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102235] text-lg font-bold text-[#e6b53b] shadow-lg shadow-[#102235]/15">H</span>
            <span className="text-lg font-bold tracking-[0.16em] text-[#102235]">HOTERRA</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#405163] md:flex" aria-label="Main navigation">
            <a href="#platform" className="transition-colors hover:text-[#102235]">Platform</a>
            <a href="#workflow" className="transition-colors hover:text-[#102235]">How it works</a>
            <a href="#modules" className="transition-colors hover:text-[#102235]">Modules</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="px-4 py-2 text-sm font-semibold text-[#405163] transition-colors hover:text-[#102235]">Sign in</Link>
            <Link to="/app" className="inline-flex items-center gap-2 rounded-full bg-[#102235] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#102235]/15 transition hover:-translate-y-0.5 hover:bg-[#1b3952]">
              Try demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-lg p-2 text-[#102235] md:hidden" aria-label="Toggle navigation" aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-[#102235]/10 bg-[#f6f4ee] px-5 py-5 md:hidden">
            <nav className="flex flex-col gap-4 text-sm font-semibold" aria-label="Mobile navigation">
              <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
              <a href="#workflow" onClick={() => setMobileOpen(false)}>How it works</a>
              <a href="#modules" onClick={() => setMobileOpen(false)}>Modules</a>
              <Link to="/app" className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#102235] px-5 py-3 text-white">Try demo <ArrowRight className="h-4 w-4" /></Link>
            </nav>
          </div>
        )}
      </header>

      <main>
        <section className="landing-grid relative overflow-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
          <div className="absolute -left-36 top-20 h-80 w-80 rounded-full bg-[#e6b53b]/15 blur-3xl" />
          <div className="absolute -right-24 top-40 h-96 w-96 rounded-full bg-[#8eb2b6]/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="landing-fade-up">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#102235]/10 bg-white/70 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#526574] shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-[#c58c09]" /> Built for hotel leadership
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.055em] text-[#102235] sm:text-6xl lg:text-[4.65rem]">
                Run the hotel with <span className="text-[#a87400]">clarity.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#5c6b78] sm:text-lg sm:leading-8">
                HOTERRA brings documents, approvals, casual workforce, vendor decisions, and executive reporting into one accountable operating system.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/app" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102235] px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#102235]/20 transition hover:-translate-y-0.5 hover:bg-[#1b3952]">
                  Explore the demo <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#platform" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#102235]/15 bg-white/65 px-7 py-3.5 text-sm font-semibold text-[#102235] transition hover:bg-white">
                  See the platform <ChevronRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#526574]">
                {['Role-based access', 'Live approval trails', 'Hotel-ready workflows'].map((item) => (
                  <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#a87400]" />{item}</span>
                ))}
              </div>
            </div>

            <ExecutivePreview />
          </div>
        </section>

        <section className="border-y border-[#102235]/10 bg-[#102235] py-6 text-white">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 text-center sm:px-8 md:grid-cols-3 md:text-left">
            <div className="flex items-center justify-center gap-3 md:justify-start"><span className="text-2xl font-semibold text-[#e6b53b]">01</span><span className="text-sm text-white/70">One source of operational truth</span></div>
            <div className="flex items-center justify-center gap-3 md:justify-start"><span className="text-2xl font-semibold text-[#e6b53b]">24/7</span><span className="text-sm text-white/70">Live decision visibility</span></div>
            <div className="flex items-center justify-center gap-3 md:justify-start"><span className="text-2xl font-semibold text-[#e6b53b]">100%</span><span className="text-sm text-white/70">Traceable approval history</span></div>
          </div>
        </section>

        <section id="platform" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a87400]">Executive control</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Less chasing. Better decisions.</h2>
              <p className="mt-5 text-base leading-7 text-[#61707d]">Give every department a clear process while keeping the General Manager close to cost, compliance, and performance.</p>
            </div>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {executiveBenefits.map(({ icon: Icon, eyebrow, title, description }) => (
                <article key={title} className="group rounded-[1.75rem] border border-[#102235]/10 bg-white p-7 shadow-[0_18px_55px_rgba(16,34,53,0.06)] transition hover:-translate-y-1 hover:shadow-[0_24px_65px_rgba(16,34,53,0.1)]">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102235] text-[#e6b53b]"><Icon className="h-5 w-5" /></span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a7a30]">{eyebrow}</span>
                  </div>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-0.025em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#687681]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 bg-white py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a87400]">One connected workflow</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">From request to result.</h2>
              <p className="mt-5 text-base leading-7 text-[#61707d]">HOTERRA makes the path visible from the first department request to final approval, execution, evaluation, and reporting.</p>
              <Link to="/app" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#102235]">Walk through the demo <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="relative rounded-[2rem] bg-[#f6f4ee] p-5 sm:p-8">
              <div className="absolute bottom-12 left-[2.65rem] top-12 w-px bg-[#102235]/10 sm:left-[4.15rem]" />
              {[
                ['Department request', 'Need, dates, services, and quantities are captured.'],
                ['Controlled approval', 'HR, Finance, and GM decisions follow the configured route.'],
                ['Procurement execution', 'Approved vendors, prices, and changes stay transparent.'],
                ['Performance review', 'Cost and vendor quality feed executive reporting.'],
              ].map(([title, text], index) => (
                <div key={title} className="relative flex gap-5 py-4">
                  <span className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-[#f6f4ee] bg-[#102235] text-xs font-bold text-[#e6b53b]">{index + 1}</span>
                  <div className="rounded-2xl border border-[#102235]/8 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#6a7782]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="modules" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a87400]">Core modules</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">One hotel. One operating view.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#687681]">Purpose-built tools that connect daily department activity to the decisions hotel leadership needs to make.</p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-[1.75rem] border border-[#102235]/10 bg-[#102235]/10 sm:grid-cols-2">
              {modules.map(({ icon: Icon, title, text }) => (
                <article key={title} className="bg-[#f6f4ee] p-7 sm:p-9">
                  <Icon className="h-6 w-6 text-[#a87400]" />
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#687681]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-10 sm:px-8 sm:pb-16">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-[#102235] px-6 py-16 text-center text-white shadow-2xl shadow-[#102235]/20 sm:px-12 sm:py-20">
            <div className="absolute -left-20 -top-28 h-72 w-72 rounded-full border border-white/10" />
            <div className="absolute -right-16 -bottom-32 h-80 w-80 rounded-full bg-[#e6b53b]/10 blur-2xl" />
            <div className="relative mx-auto max-w-3xl">
              <Building2 className="mx-auto h-8 w-8 text-[#e6b53b]" />
              <h2 className="mt-6 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">See your hotel more clearly.</h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">Explore how HOTERRA turns daily operations into clear ownership, faster approvals, and confident executive decisions.</p>
              <Link to="/app" className="mt-9 inline-flex items-center justify-center gap-2 rounded-full bg-[#e6b53b] px-7 py-3.5 text-sm font-bold text-[#102235] transition hover:-translate-y-0.5 hover:bg-[#f0c55d]">Try HOTERRA demo <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#102235]/10 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-center text-xs text-[#71808c] sm:px-8 md:flex-row md:text-left">
          <div className="flex items-center gap-2 font-semibold tracking-[0.12em] text-[#102235]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#102235] text-[#e6b53b]">H</span> HOTERRA</div>
          <p>Hotel governance, workforce, and document control — connected.</p>
          <p>© {new Date().getFullYear()} HOTERRA</p>
        </div>
      </footer>
    </div>
  );
}

function ExecutivePreview() {
  return (
    <div className="landing-fade-up landing-delay relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-[#e6b53b]/25 via-white/20 to-[#8eb2b6]/25 blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 p-3 shadow-[0_35px_90px_rgba(16,34,53,0.2)] backdrop-blur sm:p-4">
        <div className="flex items-center justify-between border-b border-[#102235]/8 px-3 pb-3 pt-1 sm:px-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b743d]">Executive overview</p>
            <p className="mt-1 text-base font-semibold">Good morning, General Manager</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#102235] text-xs font-bold text-white">GM</div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
          {[
            ['12', 'Pending', Clock3, 'text-amber-700', 'bg-amber-50'],
            ['48', 'Documents', Files, 'text-blue-700', 'bg-blue-50'],
            ['7', 'Workforce', UsersRound, 'text-teal-700', 'bg-teal-50'],
            ['96%', 'On track', CheckCircle2, 'text-emerald-700', 'bg-emerald-50'],
          ].map(([value, label, Icon, color, bg]) => {
            const ItemIcon = Icon as typeof Clock3;
            return (
              <div key={String(label)} className="rounded-2xl border border-[#102235]/8 bg-white p-3">
                <span className={`mb-3 flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}><ItemIcon className={`h-3.5 w-3.5 ${color}`} /></span>
                <p className="text-lg font-bold tracking-[-0.03em]">{String(value)}</p>
                <p className="mt-0.5 text-[10px] text-[#7b8892]">{String(label)}</p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 px-3 pb-3 sm:grid-cols-[1.18fr_0.82fr] sm:px-4 sm:pb-4">
          <div className="rounded-2xl border border-[#102235]/8 bg-[#fbfcfc] p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold">Decision queue</p><p className="mt-0.5 text-[9px] text-[#87939c]">Items requiring leadership attention</p></div>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">3 urgent</span>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ['Casual workforce request', 'Food & Beverage', 'Finance review'],
                ['Vendor onboarding', 'Procurement', 'GM signature'],
                ['Updated safety SOP', 'Engineering', 'Final approval'],
              ].map(([title, department, status], index) => (
                <div key={title} className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm">
                  <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold">{title}</p><p className="mt-0.5 text-[8px] text-[#87939c]">{department}</p></div>
                  <span className="text-[8px] font-medium text-[#65747f]">{status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#102235] p-4 text-white">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold">Workforce spend</p><p className="mt-0.5 text-[9px] text-white/45">This month</p></div><BarChart3 className="h-4 w-4 text-[#e6b53b]" /></div>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.04em]">₼ 18,420</p>
            <p className="mt-1 text-[9px] text-emerald-300">6.4% below forecast</p>
            <div className="mt-6 flex h-20 items-end gap-1.5">
              {[35, 52, 43, 66, 58, 78, 64, 88, 73, 94].map((height, index) => (
                <span key={index} className={`flex-1 rounded-t-sm ${index === 9 ? 'bg-[#e6b53b]' : 'bg-white/15'}`} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[8px] text-white/35"><span>Week 1</span><span>Today</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
