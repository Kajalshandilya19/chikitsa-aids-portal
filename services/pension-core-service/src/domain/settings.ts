import { z } from 'zod';
import { amountRupees, hindiText, remarks } from '../lib/validators';
import { ppoPatternProblems } from './ppo-number';

/**
 * Every portal setting: key, schema, default, and whether the default is a PLACEHOLDER waiting for the
 * department (docs/OPEN_QUESTIONS.md). A setting not listed here does not exist; PUT /settings/:key
 * refuses unknown keys. Settings that change pension money or numbering are edited only by a Super
 * Admin (MASTER_SETTINGS_EDIT is non-delegable) and every change is audited.
 */
export interface SettingDef<T = unknown> {
  key: string;
  schema: z.ZodType<T>;
  default: T;
  placeholder: boolean;
  description: string;
  /** docs/OPEN_QUESTIONS.md id */
  question?: string;
}

const def = <T>(d: SettingDef<T>): SettingDef<T> => d;

const ppoPattern = z
  .string()
  .trim()
  .min(6)
  .max(60)
  .superRefine((v, ctx) => {
    for (const p of ppoPatternProblems(v)) ctx.addIssue({ code: 'custom', message: p });
  });

const consentText = z
  .object({
    version: z.string().regex(/^v\d+(\.\d+)?(-[a-z0-9]+)?$/, 'Version like v1, v1.1 or v0-placeholder'),
    text_en: z.string().trim().min(20).max(2000).regex(/^[^<>]*$/, 'No < or > allowed'),
    text_hi: hindiText.or(z.string().trim().min(20).max(2000).regex(/^[^<>]*$/)),
  })
  .strict();

export const SETTINGS = [
  def({
    key: 'ppo.number_pattern',
    schema: ppoPattern,
    default: 'RJ/HIVP/{DIST}/{YYYY}/{SEQ:6}',
    placeholder: true,
    description: 'Pattern of system-generated PPO numbers (domain/ppo-number.ts lists the tokens).',
    question: 'Q-05',
  }),
  def({
    key: 'ppo.sequence_scope',
    schema: z.enum(['DISTRICT_YEAR', 'STATE_YEAR', 'STATE']),
    default: 'DISTRICT_YEAR' as const,
    placeholder: true,
    description: 'What restarts the PPO sequence: each district each year, the state each year, or never.',
    question: 'Q-05',
  }),
  def({
    key: 'ppo.assignment_mode',
    schema: z.enum(['SYSTEM', 'MANUAL']),
    default: 'SYSTEM' as const,
    placeholder: true,
    description: 'SYSTEM generates the PPO number; MANUAL lets the approver type it (needs PPO_RECORD_MANUAL_ASSIGN).',
    question: 'Q-05',
  }),
  def({
    key: 'pension.monthly_amount',
    schema: amountRupees.nullable(),
    default: null,
    placeholder: true,
    description: 'Monthly pension in rupees shown on the PPO. Null until the department confirms the scheme rules.',
    question: 'Q-08',
  }),
  def({
    key: 'workflow.center_signoff_required',
    schema: z.boolean(),
    default: true,
    placeholder: false,
    description: 'Applications go to the Center In-charge for sign-off before the State (plan section 4).',
  }),
  def({
    key: 'consent.text',
    schema: consentText,
    default: {
      version: 'v0-placeholder',
      text_en:
        'PLACEHOLDER CONSENT TEXT. I agree that my details may be used by the Rajasthan State AIDS Control Society only to process my pension. To be replaced by the text approved by the department.',
      text_hi:
        'अस्थायी सहमति पाठ। मैं सहमत हूँ कि मेरी जानकारी का उपयोग राजस्थान राज्य एड्स नियंत्रण सोसाइटी द्वारा केवल मेरी पेंशन प्रक्रिया हेतु किया जाए। विभाग द्वारा स्वीकृत पाठ से बदला जाएगा।',
    },
    placeholder: true,
    description: 'Consent wording shown to the beneficiary; its version is stored with every consent.',
    question: 'Q-06',
  }),
  def({
    key: 'ppo.print_footer',
    schema: remarks,
    default: 'DRAFT FORMAT: the official PPO layout will be provided by the department.',
    placeholder: true,
    description: 'Footer line printed on the PPO sheet.',
    question: 'Q-05',
  }),
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]['key'];
export const SETTING_BY_KEY: ReadonlyMap<string, SettingDef> = new Map(SETTINGS.map((s) => [s.key, s as SettingDef]));
