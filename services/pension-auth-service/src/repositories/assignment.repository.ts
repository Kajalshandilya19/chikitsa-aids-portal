import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { UserRoleEntity } from '../entities/user-role.entity';

const repo = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(UserRoleEntity);

/**
 * Assignments with their role, district and center loaded. "Usable" = the assignment, its role and (for
 * CENTER roles) its center are all active. Only usable assignments can be logged into.
 */
export const assignmentRepository = {
  async forUser(userId: string, opts: { onlyUsable?: boolean } = {}, em?: EntityManager): Promise<UserRoleEntity[]> {
    const qb = repo(em)
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.role', 'r')
      .leftJoinAndSelect('a.district', 'd')
      .leftJoinAndSelect('a.center', 'c')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.is_active = true')
      .orderBy('r.sort_order', 'ASC')
      .addOrderBy('c.code', 'ASC');
    if (opts.onlyUsable) {
      qb.andWhere('r.is_active = true').andWhere('(a.center_id IS NULL OR c.is_active = true)');
    }
    return qb.getMany();
  },

  async byId(id: string, em?: EntityManager): Promise<UserRoleEntity | null> {
    return repo(em)
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.role', 'r')
      .leftJoinAndSelect('a.district', 'd')
      .leftJoinAndSelect('a.center', 'c')
      .where('a.id = :id', { id })
      .getOne();
  },

  /** True when the user holds any active STATE-scope assignment (protected user, BR-U5). */
  async hasStateAssignment(userId: string, em?: EntityManager): Promise<boolean> {
    const n = await repo(em)
      .createQueryBuilder('a')
      .innerJoin('a.role', 'r')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.is_active = true')
      .andWhere("r.scope_level = 'STATE'")
      .getCount();
    return n > 0;
  },

  /** The last assignment the user logged into, for the default choice at the next login. */
  async lastUsedAssignmentId(userId: string): Promise<string | null> {
    const rows = (await AppDataSource.query('SELECT assignment_id FROM pension_auth.sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId])) as {
      assignment_id: string;
    }[];
    return rows[0]?.assignment_id ?? null;
  },
};
