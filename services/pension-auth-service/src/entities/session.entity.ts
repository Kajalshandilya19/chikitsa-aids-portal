import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One login = one session. Access tokens carry the session id (`sid`); auth-service refuses a token
 * whose session is revoked. Refresh tokens rotate inside a session (refresh-token.entity.ts).
 */
@Entity({ name: 'sessions' })
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** The active assignment (user_roles.id); changes on POST /auth/switch. */
  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Updated on every refresh; idle longer than SESSION_IDLE_MIN ends the session. */
  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  /** Absolute end: created_at + REFRESH_TTL_HOURS, never extended. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** LOGOUT | REPLAY | SWITCH | IDLE | ADMIN | PASSWORD_CHANGED | DEACTIVATED */
  @Column({ name: 'revoked_reason', type: 'varchar', length: 32, nullable: true })
  revokedReason!: string | null;

  /** The login passed TOTP. Switching into a role that needs MFA requires it (BR-A5). */
  @Column({ name: 'mfa_verified', type: 'boolean', default: false })
  mfaVerified!: boolean;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;
}
