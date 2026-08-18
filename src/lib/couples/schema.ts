import { z } from 'zod';
import type { RetreatKind } from '@/generated/prisma/enums';
import { REGION_COUNT } from '@/lib/domain/regions';
import { RETREAT_KINDS } from '@/lib/domain/retreats';

/** Empty form fields arrive as "" and must land in the database as NULL. */
const blankToNull = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? null : s));

// Cast to a tuple of RetreatKind, not of string: z.enum needs the literal
// union to survive, or `kind` infers as string and Prisma rejects it.
const KINDS = RETREAT_KINDS.map((r) => r.kind) as [RetreatKind, ...RetreatKind[]];

export const retreatSchema = z
  .object({
    kind: z.enum(KINDS),
    // The database CHECK enforces the same range; keeping them equal means a
    // form error rather than a constraint violation.
    year: z.number().int().min(1970, 'Rok poza zakresem').max(2100, 'Rok poza zakresem'),
    place: blankToNull,
    name: blankToNull,
  })
  .refine((r) => r.kind !== 'INNE' || r.name !== null, {
    message: 'Podaj nazwę rekolekcji',
    path: ['name'],
  });

const newCircleSchema = z.object({
  number: z.number().int().min(1).max(99),
  patron: blankToNull,
  // Null means "the parish this same save is creating". The import needs that:
  // a row can introduce a circle and its parish at once, and the parish has no
  // id until the transaction is under way.
  parishId: z.string().regex(/^\d+$/).nullable(),
});

const newParishSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę parafii'),
  city: z.string().trim().min(1, 'Podaj miasto'),
});

export const coupleSchema = z
  .object({
    wifeName: z.string().trim().max(60),
    husbandName: z.string().trim().max(60),
    surname: z.string().trim().min(1, 'Podaj nazwisko').max(80),
    email: z.union([z.literal(''), z.email('Niepoprawny adres e-mail')]).transform((s) => s || null),
    phone: blankToNull,
    regionId: z.number().int().min(1).max(REGION_COUNT),
    circleId: z.string().regex(/^\d+$/).nullable(),
    newCircle: newCircleSchema.nullable(),
    parishId: z.string().regex(/^\d+$/).nullable(),
    newParish: newParishSchema.nullable(),
    children: blankToNull,
    notes: blankToNull,
  })
  // Picking an existing entity and creating a new one at once is ambiguous —
  // the combobox can only be in one of those states.
  .refine((c) => !(c.circleId && c.newCircle), {
    message: 'Wybierz istniejący krąg albo utwórz nowy',
    path: ['circleId'],
  })
  .refine((c) => !(c.parishId && c.newParish), {
    message: 'Wybierz istniejącą parafię albo utwórz nową',
    path: ['parishId'],
  });

export const saveSchema = z.object({
  couple: coupleSchema,
  retreats: z.array(retreatSchema),
});

export type CoupleInput = z.infer<typeof coupleSchema>;
export type RetreatInput = z.infer<typeof retreatSchema>;
export type SaveInput = z.infer<typeof saveSchema>;
