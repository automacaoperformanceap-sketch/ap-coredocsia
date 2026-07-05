import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8 animate-fade-up">
      <div className="min-w-0">
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-muted-foreground max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export function PageStub({
  title,
  description,
  icon: Icon = Construction,
  reference,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  reference?: string;
}) {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title={title} description={description} />
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-lg bg-accent grid place-items-center">
          <Icon className="h-6 w-6 text-accent-foreground" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Em construção</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Este módulo faz parte do roadmap do PRD e será implementado na próxima fase.
        </p>
        {reference && (
          <p className="mt-3 text-xs text-muted-foreground/70 font-mono">
            Ref. PRD §{reference}
          </p>
        )}
      </div>
    </div>
  );
}
