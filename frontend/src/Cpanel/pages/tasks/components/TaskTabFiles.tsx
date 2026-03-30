export default function TaskTabFiles() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Files</h2>
        <p className="mt-1 text-sm text-muted-foreground">This tab is reserved for upcoming file attachments.</p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-secondary/10 p-6 text-center">
        <div className="text-sm font-semibold text-foreground">Upcoming</div>
        <p className="mt-1 text-sm text-muted-foreground">
          File upload, preview, and download will be added in a future phase.
        </p>
      </div>
    </div>
  );
}
