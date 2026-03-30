import { useEffect, useState } from 'react';
import { createTaskComment, getTaskComments, type TaskComment } from '../../../../shared/api/tasks';
import { useTaskDetailsContext } from '../taskDetailsContext';

export default function TaskTabComments() {
  const { task } = useTaskDetailsContext();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);

    getTaskComments(task.id)
      .then((res) => {
        if (!alive) return;
        setComments(res.comments ?? []);
        setValue('');
      })
      .catch((err) => {
        if (!alive) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load comments');
        setComments([]);
      })
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [task.id]);

  async function addComment() {
    const body = value.trim();
    if (!body) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await createTaskComment(task.id, { body });
      setComments((prev) => [res.comment, ...prev]);
      setValue('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Comments</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep discussions tied to the task.</p>
      </div>

      <div className="grid gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder="Write a comment..."
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={addComment}
            disabled={isSubmitting}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
          >
            {isSubmitting ? 'Saving...' : 'Add Comment'}
          </button>
        </div>
      </div>
      {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div> : null}

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No comments yet.</div>
        ) : (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{comment.authorName ?? 'Workspace user'}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{comment.body}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
