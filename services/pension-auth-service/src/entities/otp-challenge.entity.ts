import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type OtpPurpose = 'PASSWORD_RESET' | 'FIRST_LOGIN';

/** An SMS OTP. Only an HMAC of the code is stored; 5 attempts, 10 minutes, single use. */
@Entity({ name: 'otp_challenges' })
export class OtpChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'purpose', type: 'varchar', length: 32 })
  purpose!: OtpPurpose;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
