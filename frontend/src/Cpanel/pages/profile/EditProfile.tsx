import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../shared/AppProvider';
import { useToast } from '../../../shared/toast/ToastProvider';
import { getProfile, updateProfile } from '../../../shared/api/profile';

type Gender = 'male' | 'female' | '';

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function EditProfilePage() {
  const { user, refreshSession } = useApp();
  const toast = useToast();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isValid = useMemo(() => fullName.trim().length >= 2 && fullName.trim().length <= 80, [fullName]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setIsLoading(true);
        const response = await getProfile();
        if (cancelled) return;

        setFullName(response.profile.fullName ?? user?.fullName ?? '');
        setEmail(response.profile.email ?? user?.email ?? '');
        setJobTitle(response.profile.jobTitle ?? '');
        setPhone(response.profile.phone ?? '');
        setCountry(response.profile.country ?? '');
        setGender((response.profile.gender as Gender) ?? '');
        setBio(response.profile.bio ?? '');
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load profile');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [toast, user?.email, user?.fullName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;

    try {
      setIsSaving(true);
      await updateProfile({
        fullName: fullName.trim(),
        jobTitle: toNullable(jobTitle),
        phone: toNullable(phone),
        country: toNullable(country),
        gender: gender || null,
        bio: toNullable(bio),
      });
      await refreshSession();
      toast.success('Profile updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground">
        Loading profile...
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Edit Profile</h2>
          <p className="mt-2 text-muted-foreground">Update public profile and personal preferences.</p>
        </div>
        <button
          type="submit"
          disabled={!isValid || isSaving}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Basic Information</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Full Name" required>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              placeholder="Your full name"
            />
          </Field>
          <Field label="Job Title">
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              placeholder="Owner, Manager, Team Lead..."
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              placeholder="+252 61 XXX XXXX"
            />
          </Field>
          <Field label="Country">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              placeholder="Country"
            />
          </Field>
          <Field label="Gender">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Bio</h3>
        <p className="mt-1 text-sm text-muted-foreground">Short description shown in internal member/team views.</p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          maxLength={300}
          className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          placeholder="Write a short bio..."
        />
        <div className="mt-2 text-right text-xs text-muted-foreground">{bio.length}/300</div>
      </section>
    </form>
  );
}

type FieldProps = {
  label: string;
  required?: boolean;
  children: React.ReactNode;
};

function Field({ label, required, children }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </div>
      {children}
    </label>
  );
}
