import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../../shared/AppProvider';

export default function ForgotPasswordPage() {
  const { resetPassword } = useApp();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      await resetPassword(email);
      setSuccessMessage('Reset link sent. Check your inbox.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="px-4 pb-14 pt-10 md:px-6 md:pt-14">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-background/90 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your account email and we will send reset instructions.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="you@example.com"
            />
          </label>

          {errorMessage && <p className="text-sm font-semibold text-red-600">{errorMessage}</p>}
          {successMessage && <p className="text-sm font-semibold text-green-700">{successMessage}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Back to{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
