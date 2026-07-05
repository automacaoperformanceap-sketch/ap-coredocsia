import { createFileRoute } from "@tanstack/react-router";
import { CheckSquare, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/workflow")({
  component: WorkflowPage,
});

function WorkflowPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Controle de qualidade
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Workflow de qualidade
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Aprovação, reprovação, correção e revalidação documental, com trilha de auditoria
            de cada etapa do processo.
          </p>
        </div>
      </header>

      <Card className="p-10 flex flex-col items-center justify-center text-center gap-3 border-dashed">
        <CheckSquare className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium">Em construção</p>
          <p className="text-sm text-muted-foreground">
            Esta seção será disponibilizada em breve.
          </p>
        </div>
      </Card>
    </div>
  );
}
