import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { UserEntity } from '../entities/user.entity';
import { blindIndex, nameSearchTokens } from '../lib/pii';
import { normalizeMobile } from '../lib/validators';

const repo = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(UserEntity);

export interface UserListFilter {
  q?: string | undefined;
  roleCode?: string | undefined;
  districtId?: string | undefined;
  centerId?: string | undefined;
  isActive?: boolean | undefined;
  /** Scope restriction: only users with an active assignment in this district (DISTRICT callers). */
  scopeDistrictId?: string | undefined;
  page: number;
  limit: number;
}

export const userRepository = {
  async byId(id: string, em?: EntityManager): Promise<UserEntity | null> {
    return repo(em).findOne({ where: { id } });
  },

  /** With password hash, history and MFA secret: only for login and password flows. */
  async byIdWithSecrets(id: string, em?: EntityManager): Promise<UserEntity | null> {
    return repo(em)
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.previousPasswordHashes', 'u.mfaSecret'])
      .where('u.id = :id', { id })
      .getOne();
  },

  async byCodeWithSecrets(userCode: string, em?: EntityManager): Promise<UserEntity | null> {
    return repo(em)
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.previousPasswordHashes', 'u.mfaSecret'])
      .where('u.user_code = :userCode', { userCode: userCode.toLowerCase() })
      .getOne();
  },

  async codeExists(userCode: string, em?: EntityManager): Promise<boolean> {
    return (await repo(em).count({ where: { userCode } })) > 0;
  },

  /**
   * Search: a 10-digit number is matched exactly against the mobile blind index; anything else is
   * matched as a User ID prefix OR as name words (every word must match a name token).
   */
  async list(f: UserListFilter): Promise<[UserEntity[], number]> {
    const qb = repo().createQueryBuilder('u');
    if (f.q) {
      const q = f.q.trim();
      const asMobile = normalizeMobile(q);
      if (/^[6-9]\d{9}$/.test(asMobile)) {
        qb.andWhere('u.mobile_lookup = :ml', { ml: blindIndex(asMobile) });
      } else {
        const tokens = nameSearchTokens(q);
        qb.andWhere(
          tokens.length ? '(u.user_code LIKE :codePrefix OR u.full_name_tokens @> :tokens::text[])' : 'u.user_code LIKE :codePrefix',
          { codePrefix: `${q.toLowerCase().replace(/[%_\\]/g, '')}%`, tokens },
        );
      }
    }
    if (f.isActive !== undefined) qb.andWhere('u.is_active = :active', { active: f.isActive });
    const assignmentFilter: string[] = [];
    const params: Record<string, unknown> = {};
    if (f.roleCode) {
      assignmentFilter.push('r.code = :roleCode');
      params['roleCode'] = f.roleCode;
    }
    if (f.districtId) {
      assignmentFilter.push('a.district_id = :districtId');
      params['districtId'] = f.districtId;
    }
    if (f.centerId) {
      assignmentFilter.push('a.center_id = :centerId');
      params['centerId'] = f.centerId;
    }
    if (f.scopeDistrictId) {
      assignmentFilter.push('a.district_id = :scopeDistrictId');
      params['scopeDistrictId'] = f.scopeDistrictId;
    }
    if (assignmentFilter.length) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM pension_auth.user_roles a JOIN pension_auth.roles r ON r.id = a.role_id WHERE a.user_id = u.id AND a.is_active AND ${assignmentFilter.join(' AND ')})`,
        params,
      );
    }
    return qb
      .orderBy('u.userCode', 'ASC')
      .skip((f.page - 1) * f.limit)
      .take(f.limit)
      .getManyAndCount();
  },
};
