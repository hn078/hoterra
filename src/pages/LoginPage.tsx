import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  Lock,
  User,
  FileText,
  Shield,
  Clock,
  BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';

const FEATURES = [
  { icon: FileText, color: 'text-hoterra-gold', title: 'Centralized Documents', desc: 'All your documents in one secure place' },
  { icon: Shield, color: 'text-blue-400', title: 'Workflow Automation', desc: 'Streamlined approvals and processes' },
  { icon: Clock, color: 'text-green-400', title: 'Real-time Access', desc: 'Access up-to-date documents anytime, anywhere' },
  { icon: BarChart3, color: 'text-purple-400', title: 'Insights & Reporting', desc: 'Powerful analytics for better decisions' },
];

export function LoginPage() {
  const [email, setEmail] = useState('fuad.ahmadov@hoterra.az');
  const [password, setPassword] = useState('password123');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotMessage, setShowForgotMessage] = useState(false);
  const [ssoMessage, setSsoMessage] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-hoterra-offwhite bg-dot-grid">
      {/* Language selector */}
      <div className="absolute right-6 top-6 z-10">
        <button className="btn-secondary gap-2 py-2 shadow-sm">
          <Globe className="h-4 w-4" />
          English
        </button>
      </div>

      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        {/* Left panel */}
        <div className="relative hidden w-[45%] overflow-hidden rounded-r-[3rem] bg-login-resort bg-cover bg-center lg:flex lg:flex-col lg:justify-between lg:p-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                <span className="text-2xl font-bold text-hoterra-gold">H</span>
              </div>
              <div>
                <div className="text-xl font-bold tracking-wide text-white">
                  HOT<span className="text-hoterra-gold">E</span>RR<span className="text-hoterra-gold">A</span>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="mb-4 text-3xl font-bold leading-tight text-white">
              Intelligent Document Management for Hospitality Excellence
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-white/80">
              Centralize. Automate. Collaborate. Real-time document control for modern hospitality organizations.
            </p>
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{title}</div>
                    <div className="text-xs text-white/70">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-6 text-xs text-white/50">
            <span>ISO 27001</span>
            <span>GDPR Compliant</span>
            <span>Secure Cloud Storage</span>
          </div>
        </div>

        {/* Right — login card */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-[420px]">
            <div className="card p-8 shadow-login">
              <div className="mb-6 flex justify-center">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-navy text-lg font-bold text-hoterra-gold">
                    H
                  </div>
                  <span className="text-lg font-bold text-hoterra-navy">HOTERRA</span>
                </div>
              </div>

              <h1 className="text-center text-xl font-bold text-hoterra-navy">Welcome Back!</h1>
              <p className="mb-6 text-center text-sm text-gray-500">Sign in to continue to your account</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Email or Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email or username"
                      className="input pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="input pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-gray-600">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="rounded border-gray-300 text-hoterra-navy"
                    />
                    Remember me
                  </label>
                  <button type="button" onClick={() => setShowForgotMessage(true)} className="text-hoterra-steel hover:underline">
                    Forgot Password?
                  </button>
                </div>

                {showForgotMessage && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Password reset is managed by your administrator. Please contact your system administrator to reset your password.
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 font-semibold">
                  {loading ? 'Signing in...' : 'Sign In'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">or continue with</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSsoMessage('Microsoft 365 SSO can be enabled in Settings → Integrations by your administrator.')}
                  className="btn-secondary py-2.5 text-xs"
                >
                  Microsoft 365
                </button>
                <button
                  type="button"
                  onClick={() => setSsoMessage('Google SSO can be enabled in Settings → Integrations by your administrator.')}
                  className="btn-secondary py-2.5 text-xs"
                >
                  Google
                </button>
              </div>
              {ssoMessage && (
                <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">{ssoMessage}</p>
              )}

              <p className="mt-6 text-center text-xs text-gray-500">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => window.open('mailto:admin@hoterra.az?subject=HOTERRA%20HDMS%20Account%20Request', '_blank')}
                  className="font-medium text-hoterra-steel hover:underline"
                >
                  Contact Administrator
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8 text-xs text-gray-400">
        <span className="mx-auto lg:mx-0 lg:ml-[45%] lg:pl-12">
          © 2025 HOTERRA Document Management System. All rights reserved.
        </span>
        <span>v1.0.3</span>
      </footer>
    </div>
  );
}
