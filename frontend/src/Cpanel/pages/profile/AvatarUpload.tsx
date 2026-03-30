import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../shared/AppProvider';
import { deleteProfileAvatar, getProfile, uploadProfileAvatar } from '../../../shared/api/profile';
import { useToast } from '../../../shared/toast/ToastProvider';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function AvatarUploadPage() {
  const { user } = useApp();
  const toast = useToast();

  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const initials = useMemo(() => {
    const source = (user?.fullName ?? user?.email ?? 'U').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? 'U').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
  }, [user?.email, user?.fullName]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setIsLoading(true);
        const response = await getProfile();
        if (cancelled) return;
        setProfileAvatar(response.profile.avatar ?? null);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load avatar');
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
  }, [toast]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error('File size must be 5MB or less.');
      return;
    }

    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      const dataBase64 = await fileToDataUrl(selectedFile);
      const response = await uploadProfileAvatar({
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        dataBase64,
      });

      setProfileAvatar(response.profile.avatar ?? null);
      setSelectedFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      setLocalPreviewUrl(null);
      toast.success('Avatar updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    try {
      setIsRemoving(true);
      const response = await deleteProfileAvatar();
      setProfileAvatar(response.profile.avatar ?? null);
      setSelectedFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      setLocalPreviewUrl(null);
      toast.success('Avatar removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove avatar');
    } finally {
      setIsRemoving(false);
    }
  }

  const previewSrc = localPreviewUrl ?? profileAvatar;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-sm text-muted-foreground">
        Loading avatar settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Avatar Upload</h2>
        <p className="mt-2 text-muted-foreground">Upload your profile photo used in members and task views.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</div>
          <div className="mt-4">
            {previewSrc ? (
              <img src={previewSrc} alt="Avatar preview" className="h-36 w-36 rounded-full border border-border object-cover" />
            ) : (
              <div className="flex h-36 w-36 items-center justify-center rounded-full border border-border bg-secondary/30 text-3xl font-bold text-primary">
                {initials}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background p-5">
          <h3 className="text-base font-semibold text-foreground">Select Image</h3>
          <p className="mt-1 text-sm text-muted-foreground">PNG, JPG, or WEBP. Maximum size 5MB.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark">
            Choose File
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={handleFileChange} />
          </label>
          {selectedFile ? <div className="mt-3 text-xs text-muted-foreground">Selected: {selectedFile.name}</div> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? 'Uploading...' : 'Upload Avatar'}
            </button>
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={(!profileAvatar && !localPreviewUrl) || isRemoving}
              className="rounded-full border border-border bg-background px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRemoving ? 'Removing...' : 'Remove Avatar'}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
            Tip: Use a square image for best result in circular avatars.
          </div>
        </section>
      </div>
    </div>
  );
}
