import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type DocStatus } from "@/lib/documents";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

const STYLE: Record<DocStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  processing: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  processed: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  failed: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

const ICON = {
  pending: Clock,
  processing: Loader2,
  processed: CheckCircle2,
  failed: XCircle,
} as const;

export function StatusBadge({ status }: { status: DocStatus }) {
  const Icon = ICON[status];
  return (
    <Badge variant="outline" className={`gap-1.5 font-normal ${STYLE[status]}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
