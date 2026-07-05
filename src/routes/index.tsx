import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileScan, ShieldCheck, Workflow, Database, Sparkles, Archive } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AP - CoreDocs IA — Plataforma Documental Inteligente" },
      {
        name: "description",
        content:
          "Digitalize, processe e gerencie documentos com OCR, IA e GED em uma plataforma SaaS multi-tenant.",
      },
      { property: "og:title", content: "AP - CoreDocs IA — Plataforma Documental Inteligente" },
      {
        property: "og:description",
        content:
          "Digitalize, processe e gerencie documentos com OCR, IA e GED em uma plataforma SaaS multi-tenant.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: FileScan, title: "Processamento Documental", desc: "Upload, conversão e OCR de alta precisão em lote." },
  { icon: Sparkles, title: "Extração com IA", desc: "Templates inteligentes via N8N para indexar automaticamente." },
  { icon: Database, title: "GED Multi-Tenant", desc: "Pesquisa avançada, compartilhamento seguro e versionamento." },
  { icon: Workflow, title: "Workflow de Qualidade", desc: "Aprovação, reprovação e revalidação com trilha completa." },
  { icon: Archive, title: "Retenção e Temporalidade", desc: "Classificação por tabela, cálculo automático de prazos." },
  { icon: ShieldCheck, title: "Auditoria & LGPD", desc: "Logs granulares, hash SHA-256 e isolamento por tenant." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary grid place-items-center">
              <FileScan className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">AP - CoreDocs IA</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-20 overflow-hidden">
        {/* subtle ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-20 h-[480px] w-[480px] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-primary), transparent 60%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 right-0 h-[360px] w-[360px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent), transparent 60%)" }}
        />

        <div className="relative max-w-3xl animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Plataforma inteligente de documentos
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
            Sua operação documental,{" "}
            <span className="text-primary">organizada</span> e{" "}
            <span className="text-primary">auditável</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Plataforma SaaS multi-tenant para processamento documental inteligente, OCR,
            extração com IA, GED, workflow de qualidade e gestão de retenção — com
            cobrança por créditos e isolamento total entre clientes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Começar agora</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#recursos">Ver recursos</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="mx-auto max-w-6xl px-6 py-20 border-t border-border/60">
        <div className="max-w-2xl mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Tudo o que sua operação precisa.
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Componentes integrados de ponta a ponta — do upload à eliminação, com trilha completa.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative rounded-xl border border-border bg-card p-6 hover-lift hover:border-primary/40 animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-10 w-10 rounded-lg bg-accent grid place-items-center transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-[-4deg]">
                <f.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground text-center">
          <span>© {new Date().getFullYear()} AP - CoreDocs IA. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
