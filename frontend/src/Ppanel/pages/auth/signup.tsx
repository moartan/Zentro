import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../../shared/AppProvider';

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const result = await signUp(email, password, fullName);

      if (result.requiresEmailConfirmation) {
        setSuccessMessage('Account created. Check your email to confirm your account before login.');
      } else {
        const token = searchParams.get('token');
        if (token) {
          navigate(`/invitation?token=${encodeURIComponent(token)}`, { replace: true });
        } else {
          navigate('/cpanel', { replace: true });
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="px-4 pb-14 pt-10 md:px-6 md:pt-14">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-background/90 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Start your free demo and invite your first members.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Your full name"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="you@company.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Create password"
            />
          </label>

          {errorMessage && <p className="text-sm font-semibold text-red-600">{errorMessage}</p>}
          {successMessage && <p className="text-sm font-semibold text-green-700">{successMessage}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to={searchParams.get('token') ? `/login?token=${encodeURIComponent(searchParams.get('token') ?? '')}` : '/login'} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
