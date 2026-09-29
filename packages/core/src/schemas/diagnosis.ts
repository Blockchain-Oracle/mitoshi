/** The zod validator for `Diagnosis` (the type stays zod-free in `types/diagnosis.ts`, §3.1). */
import { z } from "zod";
import { DIAGNOSIS_KINDS, type Diagnosis } from "../types/diagnosis";
import { hexSchema } from "./primitives";

export const diagnosisSchema: z.ZodType<Diagnosis> = z.object({
  kind: z.enum(DIAGNOSIS_KINDS),
  retryable: z.boolean(),
  technical: z.string(),
  errorName: z.string().optional(),
  txHash: hexSchema.optional(),
});
