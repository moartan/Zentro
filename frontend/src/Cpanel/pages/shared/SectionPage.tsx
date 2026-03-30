type SectionPageProps = {
  title: string;
  description: string;
};

export default function SectionPage({ title, description }: SectionPageProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
    </div>
  );
}
