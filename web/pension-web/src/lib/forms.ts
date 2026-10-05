import { z } from "zod";

/**
 * Form-only helpers. Field RULES come from src/lib/shared/validators.ts and nowhere else; this file
 * only composes them. If a field needs a rule that is not in validators.ts, ask for it to be added
 * there (with a V- number) instead of writing a regex or a length check here.
 */

/**
 * Presence only, for a field the catalogue has no rule for and the service checks itself
 * (the captcha answer). Not a format rule: anything typed passes, the service decides.
 */
export const filledIn = z.string().trim().refine((s) => s.length > 0, "This field is required");

/** An optional catalogue field in a form: "" means not given. */
export const blankOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]);

/** The same text typed twice (new password + confirm). Put on the object schema with `.superRefine`. */
export const sameAs =
  <K extends string>(field: K, confirm: K, message = "The two passwords do not match") =>
  (v: Record<K, unknown>, ctx: z.RefinementCtx) => {
    if (v[field] !== v[confirm]) ctx.addIssue({ code: "custom", message, path: [confirm] });
  };

/** Drop "" values before sending (optional fields the user left blank). */
export const withoutBlanks = <T extends Record<string, unknown>>(v: T): Partial<T> =>
  Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined && x !== null)) as Partial<T>;
