import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pension_auth: districts, centers, users, roles, permissions, assignments, sessions, OTPs.
 * Rule R-DB-5: migrations are hand-written SQL, reviewed like code, never generated, never edited
 * after they have run anywhere (add a new one instead).
 */
export class AuthInit1801000000001 implements MigrationInterface {
  name = 'AuthInit1801000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pension_auth.districts (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lgd_code    integer NOT NULL UNIQUE CHECK (lgd_code BETWEEN 1 AND 99999),
        code        varchar(32) NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
        name_en     varchar(150) NOT NULL,
        name_hi     varchar(150) NOT NULL,
        is_active   boolean NOT NULL DEFAULT true,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE pension_auth.centers (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code                varchar(16) NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9-]{2,15}$'),
        name_en             varchar(150) NOT NULL,
        name_hi             varchar(150),
        district_id         uuid NOT NULL REFERENCES pension_auth.districts(id),
        center_type         varchar(16) NOT NULL DEFAULT 'ART' CHECK (center_type IN ('ART','LAC','COE','OTHER')),
        soch_facility_code  varchar(32) UNIQUE,
        is_active           boolean NOT NULL DEFAULT true,
        is_placeholder      boolean NOT NULL DEFAULT false,
        created_by          uuid,
        updated_by          uuid,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX centers_district_idx ON pension_auth.centers (district_id)');

    await q.query(`
      CREATE TABLE pension_auth.users (
        id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_code                 varchar(32) NOT NULL UNIQUE CHECK (user_code ~ '^[a-z][a-z0-9._-]{3,31}$'),
        full_name                 text NOT NULL,
        full_name_tokens          text[] NOT NULL DEFAULT '{}',
        mobile                    text NOT NULL,
        mobile_lookup             varchar(64) NOT NULL UNIQUE,
        mobile_last4              varchar(4) NOT NULL,
        email                     text,
        email_lookup              varchar(64) UNIQUE,
        password_hash             text NOT NULL,
        previous_password_hashes  text[] NOT NULL DEFAULT '{}',
        password_changed_at       timestamptz,
        must_change_password      boolean NOT NULL DEFAULT true,
        mfa_secret                text,
        mfa_enabled               boolean NOT NULL DEFAULT false,
        failed_login_count        integer NOT NULL DEFAULT 0,
        locked_until              timestamptz,
        last_login_at             timestamptz,
        is_active                 boolean NOT NULL DEFAULT true,
        created_by                uuid,
        updated_by                uuid,
        created_at                timestamptz NOT NULL DEFAULT now(),
        updated_at                timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX users_full_name_tokens_gin ON pension_auth.users USING gin (full_name_tokens)');

    await q.query(`
      CREATE TABLE pension_auth.roles (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code                    varchar(64) NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{2,63}$'),
        name_en                 varchar(150) NOT NULL,
        name_hi                 varchar(150) NOT NULL,
        scope_level             varchar(16) NOT NULL CHECK (scope_level IN ('STATE','DISTRICT','CENTER')),
        mfa_required            boolean NOT NULL DEFAULT false,
        is_system               boolean NOT NULL DEFAULT true,
        is_active               boolean NOT NULL DEFAULT true,
        permissions_customized  boolean NOT NULL DEFAULT false,
        sort_order              integer NOT NULL DEFAULT 0,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE pension_auth.permissions (
        code            varchar(80) PRIMARY KEY CHECK (code ~ '^pension:[a-z_]+\\.[a-z_]+\\.[a-z_]+$'),
        section         varchar(32) NOT NULL,
        resource        varchar(32) NOT NULL,
        action          varchar(32) NOT NULL,
        label_en        varchar(200) NOT NULL,
        label_hi        varchar(200) NOT NULL,
        allowed_scopes  text[] NOT NULL,
        delegable       boolean NOT NULL DEFAULT true,
        sensitive       boolean NOT NULL DEFAULT false,
        sort_order      integer NOT NULL
      )`);

    await q.query(`
      CREATE TABLE pension_auth.role_permissions (
        role_id          uuid NOT NULL REFERENCES pension_auth.roles(id) ON DELETE CASCADE,
        permission_code  varchar(80) NOT NULL REFERENCES pension_auth.permissions(code) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_code)
      )`);

    await q.query(`
      CREATE TABLE pension_auth.user_roles (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES pension_auth.users(id),
        role_id      uuid NOT NULL REFERENCES pension_auth.roles(id),
        district_id  uuid REFERENCES pension_auth.districts(id),
        center_id    uuid REFERENCES pension_auth.centers(id),
        is_active    boolean NOT NULL DEFAULT true,
        created_by   uuid,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_roles_center_needs_district CHECK (center_id IS NULL OR district_id IS NOT NULL)
      )`);
    await q.query(`
      CREATE UNIQUE INDEX user_roles_active_unique ON pension_auth.user_roles (
        user_id, role_id,
        COALESCE(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) WHERE is_active`);
    await q.query('CREATE INDEX user_roles_user_idx ON pension_auth.user_roles (user_id)');
    await q.query('CREATE INDEX user_roles_center_idx ON pension_auth.user_roles (center_id)');
    await q.query('CREATE INDEX user_roles_district_idx ON pension_auth.user_roles (district_id)');

    await q.query(`
      CREATE TABLE pension_auth.sessions (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid NOT NULL REFERENCES pension_auth.users(id),
        assignment_id   uuid NOT NULL REFERENCES pension_auth.user_roles(id),
        created_at      timestamptz NOT NULL DEFAULT now(),
        last_seen_at    timestamptz NOT NULL DEFAULT now(),
        expires_at      timestamptz NOT NULL,
        revoked_at      timestamptz,
        revoked_reason  varchar(32),
        mfa_verified    boolean NOT NULL DEFAULT false,
        ip              varchar(64),
        user_agent      varchar(255)
      )`);
    await q.query('CREATE INDEX sessions_user_idx ON pension_auth.sessions (user_id) WHERE revoked_at IS NULL');

    await q.query(`
      CREATE TABLE pension_auth.refresh_tokens (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   uuid NOT NULL REFERENCES pension_auth.sessions(id) ON DELETE CASCADE,
        token_hash   varchar(64) NOT NULL UNIQUE,
        expires_at   timestamptz NOT NULL,
        replaced_by  uuid,
        created_at   timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX refresh_tokens_session_idx ON pension_auth.refresh_tokens (session_id)');

    await q.query(`
      CREATE TABLE pension_auth.otp_challenges (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES pension_auth.users(id),
        purpose      varchar(32) NOT NULL CHECK (purpose IN ('PASSWORD_RESET','FIRST_LOGIN')),
        code_hash    varchar(64) NOT NULL,
        expires_at   timestamptz NOT NULL,
        attempts     integer NOT NULL DEFAULT 0,
        consumed_at  timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX otp_challenges_user_idx ON pension_auth.otp_challenges (user_id, purpose)');
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['otp_challenges', 'refresh_tokens', 'sessions', 'user_roles', 'role_permissions', 'permissions', 'roles', 'users', 'centers', 'districts']) {
      await q.query(`DROP TABLE IF EXISTS pension_auth.${t}`);
    }
  }
}
