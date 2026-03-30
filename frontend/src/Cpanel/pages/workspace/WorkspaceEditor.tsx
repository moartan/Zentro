import { useEffect, useState } from 'react';
import { useToast } from '../../../shared/toast/ToastProvider';
import {
  archiveWorkspace,
  deleteWorkspace,
  deleteWorkspaceLogo,
  getWorkspaceSettings,
  type WorkspaceSettings,
  updateWorkspaceSettings,
  uploadWorkspaceLogo,
} from '../../../shared/api/workspaceSettings';

type WorkspaceTab = 'overview' | 'edit' | 'branding' | 'billing' | 'danger';

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function WorkspaceEditorPage() {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [accentColor, setAccentColor] = useState('#0ea5e9');

  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        setIsLoading(true);
        const response = await getWorkspaceSettings();
        if (cancelled) return;

        setWorkspace(response.workspace);
        setName(response.workspace.name ?? '');
        setSlug(response.workspace.slug ?? '');
        setDescription(response.workspace.description ?? '');
        setSupportEmail(response.workspace.supportEmail ?? '');
        setPhone(response.workspace.supportPhone ?? '');
        setWebsite(response.workspace.website ?? '');
        setAccentColor(response.workspace.accentColor ?? '#0ea5e9');
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load workspace');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadWorkspace();
    return () => {
      cancelled = true;
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [toast]);

  function TabButton({ id, label }: { id: WorkspaceTab; label: string }) {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          active ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-secondary/40'
        }`}
      >
        {label}
      </button>
    );
  }

  async function saveWorkspaceInfo() {
    if (!workspace) return;

    try {
      setIsSavingInfo(true);
      const response = await updateWorkspaceSettings({
        name: name.trim(),
        slug: slug.trim(),
        description: toNullable(description),
        supportEmail: toNullable(supportEmail),
        supportPhone: toNullable(phone),
        website: toNullable(website),
      });
      setWorkspace(response.workspace);
      toast.success('Workspace information updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workspace');
    } finally {
      setIsSavingInfo(false);
    }
  }

  async function saveBranding() {
    if (!workspace) return;

    try {
      setIsSavingBranding(true);
      const response = await updateWorkspaceSettings({ accentColor });
      setWorkspace(response.workspace);
      toast.success('Workspace branding updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update branding');
    } finally {
      setIsSavingBranding(false);
    }
  }

  function handleLogoPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo size must be 5MB or less.');
      return;
    }

    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setSelectedLogoFile(file);
  }

  async function handleUploadLogo() {
    if (!selectedLogoFile) return;

    try {
      setIsUploadingLogo(true);
      const dataBase64 = await fileToDataUrl(selectedLogoFile);
      const response = await uploadWorkspaceLogo({
        fileName: selectedLogoFile.name,
        contentType: selectedLogoFile.type,
        dataBase64,
      });
      setWorkspace(response.workspace);
      setSelectedLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
      toast.success('Logo uploaded successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    try {
      setIsRemovingLogo(true);
      const response = await deleteWorkspaceLogo();
      setWorkspace(response.workspace);
      setSelectedLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
      toast.success('Logo removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove logo');
    } finally {
      setIsRemovingLogo(false);
    }
  }

  async function handleArchiveToggle() {
    if (!workspace) return;
    const confirmation = archiveConfirmation.trim().toLowerCase();
    const required = (workspace.slug ?? '').trim().toLowerCase();
    if (!required || confirmation !== required) {
      toast.error('Type the workspace slug exactly to continue.');
      return;
    }

    try {
      setIsArchiving(true);
      const response = await archiveWorkspace({
        archive: !workspace.isArchived,
        confirmation: archiveConfirmation.trim(),
      });
      setWorkspace(response.workspace);
      setArchiveConfirmation('');
      toast.success(response.workspace.isArchived ? 'Workspace archived.' : 'Workspace restored.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update archive state');
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return;
    const confirmation = deleteConfirmation.trim().toLowerCase();
    const required = (workspace.slug ?? '').trim().toLowerCase();
    if (!required || confirmation !== required) {
      toast.error('Type the workspace slug exactly to delete.');
      return;
    }

    if (!deletePassword) {
      toast.error('Current password is required.');
      return;
    }

    try {
      setIsDeletingWorkspace(true);
      await deleteWorkspace({
        confirmation: deleteConfirmation.trim(),
        currentPassword: deletePassword,
      });
      toast.success('Workspace deleted. You can create a new workspace.');
      window.location.assign('/cpanel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete workspace');
    } finally {
      setIsDeletingWorkspace(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6 text-sm text-muted-foreground">
        Loading workspace settings...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6 text-sm text-muted-foreground">
        Workspace not found.
      </div>
    );
  }

  const currentLogo = logoPreviewUrl ?? workspace.logoUrl;

  return (
    <div className="rounded-2xl border border-border bg-background p-6 md:p-8">
      <h1 className="text-3xl font-bold text-foreground">Workspace</h1>
      <p className="mt-2 text-muted-foreground">Manage organization information, branding, billing, and safety settings.</p>

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          <TabButton id="overview" label="Overview" />
          <TabButton id="edit" label="Edit Workspace" />
          <TabButton id="branding" label="Branding" />
          <TabButton id="billing" label="Billing & Plan" />
          <TabButton id="danger" label="Danger Zone" />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-6">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card label="Workspace Name" value={workspace.name ?? '-'} />
              <Card label="Workspace Slug" value={workspace.slug ?? '-'} />
              <Card label="Support Email" value={workspace.supportEmail ?? '-'} />
              <Card label="Support Phone" value={workspace.supportPhone ?? '-'} />
              <Card label="Website" value={workspace.website ?? '-'} />
              <Card label="Current Plan" value={workspace.subscriptionPlan ?? '-'} />
              <Card label="Subscription Status" value={workspace.subscriptionStatus ?? '-'} />
              <Card label="Brand Color" value={workspace.accentColor ?? '#0ea5e9'} />
              <Card label="Archived" value={workspace.isArchived ? 'Yes' : 'No'} />
            </div>
            <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
              Workspace owner actions are isolated here so profile settings stay user-specific.
            </div>
          </div>
        ) : null}

        {tab === 'edit' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Edit Workspace</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                />
              </Field>
              <Field label="Slug">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                />
              </Field>
              <Field label="Support Email">
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                />
              </Field>
              <Field label="Support Phone">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+252 61 XXX XXXX"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Website">
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourcompany.com"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                    placeholder="Short description about this workspace"
                  />
                </Field>
              </div>
            </div>
            <button
              type="button"
              onClick={saveWorkspaceInfo}
              disabled={isSavingInfo}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingInfo ? 'Saving...' : 'Save Workspace'}
            </button>
          </div>
        ) : null}

        {tab === 'branding' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Branding</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Accent Color">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-10 rounded border border-border bg-transparent"
                  />
                  <span className="text-sm text-foreground">{accentColor}</span>
                </div>
              </Field>
              <Field label="Workspace Logo">
                <div className="space-y-3">
                  {currentLogo ? (
                    <img src={currentLogo} alt="Workspace logo" className="h-16 w-16 rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground">
                      No logo
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/30">
                    Choose Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoPick} />
                  </label>
                  {selectedLogoFile ? <div className="text-xs text-muted-foreground">Selected: {selectedLogoFile.name}</div> : null}
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveBranding}
                disabled={isSavingBranding}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingBranding ? 'Saving...' : 'Save Branding'}
              </button>
              <button
                type="button"
                onClick={handleUploadLogo}
                disabled={!selectedLogoFile || isUploadingLogo}
                className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
              </button>
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={!workspace.logoUrl || isRemovingLogo}
                className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemovingLogo ? 'Removing...' : 'Remove Logo'}
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'billing' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Billing & Plan</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card label="Plan" value={workspace.subscriptionPlan ?? '-'} />
              <Card label="Status" value={workspace.subscriptionStatus ?? '-'} />
            </div>
            <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
              Full billing control is available in Subscriptions. This tab gives workspace-level visibility.
            </div>
          </div>
        ) : null}

        {tab === 'danger' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Danger Zone</h2>
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="text-sm font-semibold text-foreground">
                {workspace.isArchived ? 'Restore Workspace' : 'Archive Workspace'}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Type the workspace slug <span className="font-semibold text-foreground">{workspace.slug}</span> to{' '}
                {workspace.isArchived ? 'restore' : 'archive'} this workspace.
              </p>
              <input
                type="text"
                value={archiveConfirmation}
                onChange={(e) => setArchiveConfirmation(e.target.value)}
                className="mt-3 w-full rounded-xl border border-danger/30 bg-background px-3 py-2 text-sm text-foreground outline-none ring-danger/30 focus:ring-2"
                placeholder={`Type "${workspace.slug}"`}
              />
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={isArchiving}
                className="mt-3 rounded-full border border-danger/40 bg-background px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
              >
                {isArchiving
                  ? 'Updating...'
                  : workspace.isArchived
                    ? 'Restore Workspace'
                    : 'Archive Workspace'}
              </button>
            </div>
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="text-sm font-semibold text-foreground">Delete Workspace</div>
              <p className="mt-1 text-sm text-muted-foreground">
                This permanently deletes workspace data. Type <span className="font-semibold text-foreground">{workspace.slug}</span>{' '}
                and enter your current password.
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                className="mt-3 w-full rounded-xl border border-danger/30 bg-background px-3 py-2 text-sm text-foreground outline-none ring-danger/30 focus:ring-2"
                placeholder={`Type "${workspace.slug}"`}
              />
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-danger/30 bg-background px-3 py-2 text-sm text-foreground outline-none ring-danger/30 focus:ring-2"
                placeholder="Current password"
              />
              <button
                type="button"
                onClick={handleDeleteWorkspace}
                disabled={isDeletingWorkspace}
                className="mt-3 rounded-full border border-danger/40 bg-background px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingWorkspace ? 'Deleting...' : 'Delete Workspace'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
