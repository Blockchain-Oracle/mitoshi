// Ported from Masayume 68f7a09:web/src/lib/toast.ts
import { toast } from "@/components/ui/toast";

/** Color law: no success/error toasts — neutral for records, warning for degraded truth. */
export const notify = {
  neutral: (title: string, description?: string) => toast.add({ title, description }),
  warning: (title: string, description?: string) => toast.add({ title, description, type: "warning" }),
};
