import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { CenterEntity } from '../entities/center.entity';
import { DistrictEntity } from '../entities/district.entity';
import type { AuthContext } from '../lib/access-token';
import { AUDIT, writeAudit } from '../lib/audit';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors';
import { CENTER_SORT, type CenterCreate, type CenterListQuery, type CenterPatch, type CenterUpsertRow, type DistrictPatch } from '../dtos/master.dto';

/**
 * District and Center masters (docs/API_AUTH.md §4, BR-M1..M4).
 * Scoping: a DISTRICT caller sees only its district's Centers, a CENTER caller only its own Center.
 */

const districts = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(DistrictEntity);
const centers = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(CenterEntity);

let loginCentersCache: { at: number; rows: { code: string; name_en: string; name_hi: string | null; district_en: string | null; district_hi: string | null }[] } | null = null;

export const districtView = (d: DistrictEntity) => ({
  id: d.id,
  lgd_code: d.lgdCode,
  code: d.code,
  name_en: d.nameEn,
  name_hi: d.nameHi,
  is_active: d.isActive,
});

export const centerView = (c: CenterEntity) => ({
  id: c.id,
  code: c.code,
  name_en: c.nameEn,
  name_hi: c.nameHi,
  center_type: c.centerType,
  soch_facility_code: c.sochFacilityCode,
  is_active: c.isActive,
  is_placeholder: c.isPlaceholder,
  district: c.district ? { id: c.district.id, code: c.district.code, name_en: c.district.nameEn, name_hi: c.district.nameHi } : null,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

const centerInScope = (auth: AuthContext, c: CenterEntity): boolean =>
  auth.scope === 'STATE' || (auth.scope === 'DISTRICT' && c.districtId === auth.districtId) || (auth.scope === 'CENTER' && c.id === auth.centerId);

const loadCenter = async (id: string, em?: EntityManager): Promise<CenterEntity> => {
  const c = await centers(em).findOne({ where: { id }, relations: { district: true } });
  if (!c) throw new NotFoundError('center not found');
  return c;
};

const activeDistrict = async (id: string, em?: EntityManager): Promise<DistrictEntity> => {
  const d = await districts(em).findOne({ where: { id } });
  if (!d || !d.isActive) throw new BadRequestError('Select an active district.', { code: 'E_DISTRICT_INVALID' });
  return d;
};

export const masterService = {
  async listDistricts(isActive?: boolean) {
    const rows = await districts().find({ where: isActive === undefined ? {} : { isActive }, order: { nameEn: 'ASC' } });
    return rows.map(districtView);
  },

  async updateDistrict(id: string, patch: DistrictPatch) {
    return AppDataSource.transaction(async (em) => {
      const d = await districts(em).findOne({ where: { id } });
      if (!d) throw new NotFoundError('district not found');
      if (patch.name_hi !== undefined) d.nameHi = patch.name_hi;
      if (patch.is_active !== undefined) d.isActive = patch.is_active;
      await districts(em).save(d);
      await writeAudit(em, { action: AUDIT.DISTRICT_UPDATED, entityType: 'district', entityId: d.id, data: { fields: Object.keys(patch) } });
      return districtView(d);
    });
  },

  async listCenters(auth: AuthContext, q: CenterListQuery) {
    const qb = centers().createQueryBuilder('c').leftJoinAndSelect('c.district', 'd');
    if (auth.scope === 'DISTRICT') qb.andWhere(auth.districtId ? 'c.district_id = :sd' : '1 = 0', { sd: auth.districtId });
    if (auth.scope === 'CENTER') qb.andWhere(auth.centerId ? 'c.id = :sc' : '1 = 0', { sc: auth.centerId });
    if (q.q) qb.andWhere('(c.code ILIKE :like OR c.name_en ILIKE :like)', { like: `%${q.q.replace(/[%_\\]/g, '')}%` });
    if (q.district_id) qb.andWhere('c.district_id = :did', { did: q.district_id });
    if (q.is_active !== undefined) qb.andWhere('c.is_active = :act', { act: q.is_active });
    qb.orderBy(CENTER_SORT[q.sort ?? 'code'], q.dir === 'desc' ? 'DESC' : 'ASC');
    if (q.sort && q.sort !== 'code') qb.addOrderBy('c.code', 'ASC');
    const [rows, total] = await qb.skip((q.page - 1) * q.limit).take(q.limit).getManyAndCount();
    return { rows: rows.map(centerView), total };
  },

  async getCenter(auth: AuthContext, id: string) {
    const c = await loadCenter(id);
    if (!centerInScope(auth, c)) throw new NotFoundError('center not found');
    return centerView(c);
  },

  async createCenter(auth: AuthContext, input: CenterCreate) {
    return AppDataSource.transaction(async (em) => {
      await activeDistrict(input.district_id, em);
      if (await centers(em).exist({ where: { code: input.code } })) throw new ConflictError(`Center code ${input.code} already exists.`);
      const c = await centers(em).save(
        centers(em).create({
          code: input.code,
          nameEn: input.name_en,
          nameHi: input.name_hi ?? null,
          districtId: input.district_id,
          centerType: input.center_type,
          sochFacilityCode: input.soch_facility_code ?? null,
          isActive: true,
          isPlaceholder: false,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        }),
      );
      await writeAudit(em, { action: AUDIT.CENTER_CREATED, entityType: 'center', entityId: c.id, districtId: c.districtId, centerId: c.id, data: { code: c.code } });
      return centerView(await loadCenter(c.id, em));
    });
  },

  /** Moving a Center to another district moves its user assignments with it (BR-M3). */
  async updateCenter(auth: AuthContext, id: string, patch: CenterPatch) {
    return AppDataSource.transaction(async (em) => {
      const c = await loadCenter(id, em);
      if (patch.district_id && patch.district_id !== c.districtId) {
        await activeDistrict(patch.district_id, em);
        await em.query('UPDATE pension_auth.user_roles SET district_id = $1, updated_at = now() WHERE center_id = $2', [patch.district_id, c.id]);
        c.districtId = patch.district_id;
        c.district = undefined;
      }
      if (patch.name_en !== undefined) c.nameEn = patch.name_en;
      if (patch.name_hi !== undefined) c.nameHi = patch.name_hi;
      if (patch.center_type !== undefined) c.centerType = patch.center_type;
      if (patch.soch_facility_code !== undefined) c.sochFacilityCode = patch.soch_facility_code;
      c.isPlaceholder = false;
      c.updatedBy = auth.userId;
      await centers(em).save(c);
      await writeAudit(em, { action: AUDIT.CENTER_UPDATED, entityType: 'center', entityId: c.id, districtId: c.districtId, centerId: c.id, data: { fields: Object.keys(patch) } });
      return centerView(await loadCenter(c.id, em));
    });
  },

  /** Deactivating a Center ends every session logged into it (BR-M4). */
  async setCenterActive(auth: AuthContext, id: string, active: boolean) {
    return AppDataSource.transaction(async (em) => {
      const c = await loadCenter(id, em);
      c.isActive = active;
      c.updatedBy = auth.userId;
      await centers(em).save(c);
      if (!active) {
        await em.query(
          `UPDATE pension_auth.sessions SET revoked_at = now(), revoked_reason = 'DEACTIVATED'
           WHERE revoked_at IS NULL AND assignment_id IN (SELECT id FROM pension_auth.user_roles WHERE center_id = $1)`,
          [c.id],
        );
      }
      await writeAudit(em, { action: active ? AUDIT.CENTER_ACTIVATED : AUDIT.CENTER_DEACTIVATED, entityType: 'center', entityId: c.id, centerId: c.id, districtId: c.districtId });
      return centerView(c);
    });
  },

  /**
   * The login screen's Center picker (public, before login). Active Centers only, and only what a
   * signboard shows: code, name, district. ART Centre lists are published by NACO/RSACS; no user,
   * count or SOCH facility code is exposed. Cached for 5 minutes.
   */
  async loginCenters() {
    if (loginCentersCache && Date.now() - loginCentersCache.at < 5 * 60_000) return loginCentersCache.rows;
    const rows = await centers().find({ where: { isActive: true }, relations: { district: true }, order: { code: 'ASC' } });
    const out = rows.map((c) => ({
      code: c.code,
      name_en: c.nameEn,
      name_hi: c.nameHi,
      district_en: c.district?.nameEn ?? null,
      district_hi: c.district?.nameHi ?? null,
    }));
    loginCentersCache = { at: Date.now(), rows: out };
    return out;
  },

  // ---------------------------------------------------------------- internal (service token)

  async allDistricts() {
    return (await districts().find({ order: { nameEn: 'ASC' } })).map(districtView);
  },

  async allCenters() {
    const rows = await centers().find({ relations: { district: true }, order: { code: 'ASC' } });
    return rows.map((c) => ({ ...centerView(c), district_id: c.districtId }));
  },

  /** Center import commit (data-service). Creates or updates by code; one transaction for the batch. */
  async upsertCenters(actorUserId: string, rows: CenterUpsertRow[]) {
    return AppDataSource.transaction(async (em) => {
      const byLgd = new Map((await districts(em).find()).map((d) => [d.lgdCode, d]));
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      for (const r of rows) {
        const d = byLgd.get(r.district_lgd_code);
        if (!d) throw new BadRequestError(`Unknown district LGD code ${r.district_lgd_code} for Center ${r.code}`, { code: 'E_DISTRICT_INVALID' });
        const existing = await centers(em).findOne({ where: { code: r.code } });
        const next = {
          nameEn: r.name_en,
          nameHi: r.name_hi ?? null,
          districtId: d.id,
          centerType: r.center_type,
          sochFacilityCode: r.soch_facility_code ?? null,
        };
        if (!existing) {
          await centers(em).save(centers(em).create({ code: r.code, ...next, isActive: true, isPlaceholder: false, createdBy: actorUserId, updatedBy: actorUserId }));
          created++;
          continue;
        }
        const same =
          existing.nameEn === next.nameEn &&
          existing.nameHi === next.nameHi &&
          existing.districtId === next.districtId &&
          existing.centerType === next.centerType &&
          existing.sochFacilityCode === next.sochFacilityCode;
        if (same) {
          unchanged++;
          continue;
        }
        if (existing.districtId !== next.districtId) {
          await em.query('UPDATE pension_auth.user_roles SET district_id = $1, updated_at = now() WHERE center_id = $2', [next.districtId, existing.id]);
        }
        Object.assign(existing, next, { isPlaceholder: false, updatedBy: actorUserId });
        await centers(em).save(existing);
        updated++;
      }
      await writeAudit(em, { action: AUDIT.CENTERS_IMPORTED, actorUserId, entityType: 'center', data: { created, updated, unchanged } });
      return { created, updated, unchanged };
    });
  },
};
