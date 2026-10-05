import { Column, Entity } from 'typeorm';
import { piiTransformer } from '../lib/pii';
import { BaseRow } from './base';

/**
 * A person who logs in. Personal fields are encrypted at rest (🔒, rule R-PII-1); equality lookups use
 * the `_lookup` blind index (HMAC) beside them, never the encrypted column.
 */
@Entity({ name: 'users' })
export class UserEntity extends BaseRow {
  /** V-002 login id, lowercase, unique */
  @Column({ name: 'user_code', type: 'varchar', length: 32, unique: true })
  userCode!: string;

  /** 🔒 V-001 */
  @Column({ name: 'full_name', type: 'text', transformer: piiTransformer })
  fullName!: string;

  /** Word-wise blind index tokens of full_name for name search (lib/pii nameBlindIndexes). */
  @Column({ name: 'full_name_tokens', type: 'text', array: true, default: () => "'{}'" })
  fullNameTokens!: string[];

  /** 🔒 V-004 */
  @Column({ name: 'mobile', type: 'text', transformer: piiTransformer })
  mobile!: string;

  @Column({ name: 'mobile_lookup', type: 'varchar', length: 64, unique: true })
  mobileLookup!: string;

  @Column({ name: 'mobile_last4', type: 'varchar', length: 4 })
  mobileLast4!: string;

  /** 🔒 V-005, optional */
  @Column({ name: 'email', type: 'text', nullable: true, transformer: piiTransformer })
  email!: string | null;

  @Column({ name: 'email_lookup', type: 'varchar', length: 64, nullable: true, unique: true })
  emailLookup!: string | null;

  /** argon2id. Never returned by any endpoint. */
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  /** Last 3 hashes, for the "not one of the last 3" rule (V-006). */
  @Column({ name: 'previous_password_hashes', type: 'text', array: true, default: () => "'{}'", select: false })
  previousPasswordHashes!: string[];

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  /** 🔒 base32 TOTP secret */
  @Column({ name: 'mfa_secret', type: 'text', nullable: true, transformer: piiTransformer, select: false })
  mfaSecret!: string | null;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'failed_login_count', type: 'integer', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
