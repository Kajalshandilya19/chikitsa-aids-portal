import { config } from '../config';
import { AppError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { maskMobile } from '../lib/mask';

const logger = createLogger({ service: 'pension-auth-service:sms' });

/**
 * Outgoing SMS. The message text never mentions HIV (rule R-PII-6): it can appear on a lock screen.
 *
 *   SMS_PROVIDER=log       the text goes to this service's log at WARN level. Local only: the config
 *                          refuses it outside APP_ENV=local (S-CFG-4).
 *   SMS_PROVIDER=esanchar  the state eSanchar gateway. NOT IMPLEMENTED in Phase 0 (docs/OPEN_QUESTIONS.md Q-15).
 */
export const smsClient = {
  async send(mobile: string, text: string): Promise<void> {
    const cfg = config();
    if (cfg.SMS_PROVIDER === 'log') {
      console.warn(`[local SMS to ${maskMobile(mobile)}] ${text}`);
      return;
    }
    logger.error('SMS provider esanchar is not implemented yet');
    throw new AppError(503, 'SMS gateway is not configured. Contact the administrator.', { code: 'E_SMS_UNAVAILABLE', expose: true });
  },
};
