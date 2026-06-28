import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

export function LoginPage() {
  const [email, setEmail] = useState('fuad.ahmadov@hoterra.az');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-hoterra-navy p-12 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-hoterra-gold text-2xl font-bold text-hoterra-navy">
              H
            </div>
            <div>
              <div className="text-2xl font-bold tracking-wide">HOTERRA</div>
              <div className="text-sm text-white/60">Document Management System</div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-bold leading-tight">
            Hospitality • Technology • Resource
          </h2>
          <p className="text-lg text-white/70">
            Centralized document management for hotels. Digital approval, versioning, and legally
            significant electronic signatures.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 text-sm text-white/60">
            <div>✓ 11 Departments</div>
            <div>✓ Digital Signatures</div>
            <div>✓ Version Control</div>
            <div>✓ Audit Trail</div>
          </div>
        </div>

        <div className="text-xs text-white/40">© 2025 HOTERRA Document Management System</div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-hoterra-offwhite p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-hoterra-navy text-xl font-bold text-hoterra-gold">
                H
              </div>
              <div className="text-xl font-bold text-hoterra-navy">HOTERRA HDMS</div>
            </div>
          </div>

          <h1 className="mb-2 text-2xl font-bold text-hoterra-navy">Sign In</h1>
          <p className="mb-8 text-sm text-gray-500">
            Enter your credentials to access the document management system
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-hoterra-navy py-3 text-sm font-semibold text-white transition-colors hover:bg-hoterra-steel disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-medium text-gray-500">Demo accounts</p>
            <div className="space-y-1 text-xs text-gray-600">
              <p>GM: fuad.ahmadov@hoterra.az</p>
              <p>HOD: nigar.rustamova@hoterra.az</p>
              <p>Password: password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
