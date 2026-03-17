import { z } from "zod";

export const openShiftSchema = z.object({
  openingCash: z
    .number({ error: "Modal awal wajib diisi" })
    .min(0, "Modal awal tidak boleh negatif"),
});

export const closeShiftSchema = z.object({
  actualCash: z
    .number({ error: "Jumlah uang cash aktual wajib diisi" })
    .min(0, "Jumlah tidak boleh negatif"),
  notes: z.string().max(500).optional(),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

