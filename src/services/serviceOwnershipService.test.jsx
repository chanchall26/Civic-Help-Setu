import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assignServiceOwnership,
  clearServiceOwnership,
  getOwnershipMap,
  describeOwner,
  validateOwnership,
  normalizeOwnership,
  filterByOwnership,
  buildOwnershipFilterOptions,
  MAX_NOTE_LENGTH,
} from './serviceOwnershipService';
import { setCurrentActor, PermissionDeniedError } from './accessControl';
import { saveAdminService, getAdminServices, getAuditLogs, deleteAdminService } from './adminService';
import { getAllServices, getServiceById } from './serviceCatalog';
import { removeServiceGuide } from '../utils/adminDestructiveActions';
import ServiceRecordList from '../components/admin/ServiceRecordList';

const makeStorage = () => {
  const data = new Map();
  return {
    getItem: vi.fn((k) => (data.has(k) ? data.get(k) : null)),
    setItem: vi.fn((k, v) => data.set(k, String(v))),
    removeItem: vi.fn((k) => data.delete(k)),
    data,
  };
};

const users = [
  { id: 'u1', username: 'Priya', role: 'moderator' },
  { id: 'u2', username: 'Amit', role: 'editor' },
];
const services = [{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }, { id: 's3', name: 'Three' }];

let storage;
beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', makeStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setCurrentActor({ id: 'a1', role: 'admin', username: 'Admin' });
});

const assign = (id, input) => assignServiceOwnership(id, input, { users, actorName: 'Admin', storage });

describe('assignment and reassignment', () => {
  it('stores a reviewer, team, status and note, separately from the service record', () => {
    const before = JSON.stringify(getAdminServices());
    const result = assign('s1', { reviewerId: 'u1', team: 'Revenue', queueStatus: 'in_review', privateNote: 'Check the fee link' });
    expect(result.ok).toBe(true);
    expect(getOwnershipMap(storage).s1).toMatchObject({ reviewerId: 'u1', reviewerName: 'Priya', team: 'Revenue', queueStatus: 'in_review' });
    expect(JSON.stringify(getAdminServices())).toBe(before);
  });

  it('reassigns without touching the creator or last editor on the service', () => {
    saveAdminService({ name: 'Custom Guide', category: 'Identity', shortDescription: 'x' }, 'Editor Eve');
    const custom = getAdminServices().find((s) => s.name === 'Custom Guide');
    const snapshot = JSON.stringify(custom);
    assign(custom.id, { reviewerId: 'u1' });
    assign(custom.id, { reviewerId: 'u2', team: 'Docs' });
    expect(getOwnershipMap(storage)[custom.id].reviewerId).toBe('u2');
    expect(JSON.stringify(getAdminServices().find((s) => s.id === custom.id))).toBe(snapshot);
  });

  it('records the change in the audit trail without the private note', () => {
    assign('s1', { reviewerId: 'u1', privateNote: 'secret detail' });
    const entry = getAuditLogs().find((l) => l.action === 'OWNERSHIP_CHANGED');
    expect(entry.details).toContain('Priya');
    expect(JSON.stringify(entry)).not.toContain('secret detail');
  });

  it('clears an assignment', () => {
    assign('s1', { team: 'Docs' });
    expect(clearServiceOwnership('s1', { storage })).toBe(true);
    expect(getOwnershipMap(storage).s1).toBeUndefined();
    expect(clearServiceOwnership('s1', { storage })).toBe(false);
  });

  it('is refused for a non-admin', () => {
    setCurrentActor({ id: 'c1', role: 'citizen' });
    expect(() => assign('s1', { team: 'Docs' })).toThrow(PermissionDeniedError);
    expect(() => getOwnershipMap(storage)).toThrow(PermissionDeniedError);
  });
});

describe('validation', () => {
  it('requires a reviewer or a team', () => {
    expect(validateOwnership({}, users).errors.owner).toBeTruthy();
    expect(validateOwnership(null, users).ok).toBe(false);
  });
  it('rejects an unknown reviewer, a bad status, a long team and a long note', () => {
    expect(validateOwnership({ reviewerId: 'ghost' }, users).errors.reviewerId).toBeTruthy();
    expect(validateOwnership({ team: 'x', queueStatus: 'bogus' }, users).errors.queueStatus).toBeTruthy();
    expect(validateOwnership({ team: 'x'.repeat(80) }, users).errors.team).toBeTruthy();
    expect(validateOwnership({ team: 'x', privateNote: 'n'.repeat(MAX_NOTE_LENGTH + 1) }, users).errors.privateNote).toBeTruthy();
  });
  it('does not save an invalid assignment', () => {
    expect(assign('s1', { reviewerId: 'ghost' }).ok).toBe(false);
    expect(getOwnershipMap(storage)).toEqual({});
  });
});

describe('unassigned records and missing metadata', () => {
  it('treats absent, empty and malformed entries as unassigned', () => {
    for (const bad of [undefined, null, 'x', 5, [], {}, { reviewerId: '', team: '' }]) {
      expect(normalizeOwnership(bad)).toBeNull();
      expect(describeOwner(bad, users).state).toBe('unassigned');
    }
  });
  it('reads corrupt storage as empty without throwing', () => {
    storage.setItem('civicbridge_service_ownership_v1', '{not json');
    expect(getOwnershipMap(storage)).toEqual({});
    storage.setItem('civicbridge_service_ownership_v1', JSON.stringify({ s1: 'junk', s2: { team: 'Docs', queueStatus: 'zzz' } }));
    expect(getOwnershipMap(storage)).toEqual({ s2: expect.objectContaining({ team: 'Docs', queueStatus: 'none' }) });
  });
  it('reports a deleted reviewer as unavailable using the saved name', () => {
    assign('s1', { reviewerId: 'u1' });
    const record = getOwnershipMap(storage).s1;
    const owner = describeOwner(record, users.filter((u) => u.id !== 'u1'));
    expect(owner.state).toBe('unavailable');
    expect(owner.label).toContain('Priya');
    expect(owner.label).toContain('unavailable');
    expect(() => describeOwner(record, undefined)).not.toThrow();
  });
});

describe('filters', () => {
  const map = {
    s1: { reviewerId: 'u1', reviewerName: 'Priya', team: 'Revenue' },
    s2: { reviewerId: 'gone', reviewerName: 'Old Reviewer' },
  };
  const ids = (filter) => filterByOwnership(services, map, users, filter).map((s) => s.id);

  it('filters assigned, unassigned and unavailable', () => {
    expect(ids('all')).toEqual(['s1', 's2', 's3']);
    expect(ids('assigned')).toEqual(['s1', 's2']);
    expect(ids('unassigned')).toEqual(['s3']);
    expect(ids('unavailable')).toEqual(['s2']);
  });
  it('filters by reviewer and by team', () => {
    expect(ids('reviewer:u1')).toEqual(['s1']);
    expect(ids('team:Revenue')).toEqual(['s1']);
    expect(ids('team:Nobody')).toEqual([]);
  });
  it('offers an option for each reviewer and team present', () => {
    const values = buildOwnershipFilterOptions(map, users).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['all', 'unassigned', 'assigned', 'reviewer:u1', 'reviewer:gone', 'team:Revenue']));
  });
  it('survives non-array services and a missing map', () => {
    expect(filterByOwnership(undefined, undefined, users, 'assigned')).toEqual([]);
    expect(filterByOwnership(services, undefined, users, 'unassigned')).toHaveLength(3);
  });
});

describe('admin list markup', () => {
  const map = { s1: { reviewerId: 'u1', reviewerName: 'Priya', team: 'Revenue', queueStatus: 'in_review', privateNote: 'SECRET' } };
  const render = (extra) => renderToStaticMarkup(<ServiceRecordList services={services} onEdit={() => {}} onDelete={() => {}} {...extra} />);

  it('shows owner, team and status next to each record, never the private note', () => {
    const html = render({ ownership: map, users, onAssign: () => {} });
    expect(html).toContain('Priya / Team: Revenue');
    expect(html).toContain('In review');
    expect(html).toContain('Unassigned');
    expect(html).toContain('aria-label="Assign reviewer for One"');
    expect(html).not.toContain('SECRET');
  });
  it('is unchanged when no assignment handler is passed', () => {
    const html = render({});
    expect(html).not.toContain('Reviewer / Team');
    expect(html).not.toContain('Assign');
  });
});

describe('deleting a service', () => {
  const removeGuide = (id, st) =>
    removeServiceGuide({
      id,
      name: 'Custom Guide',
      builtIn: false,
      actor: 'Admin',
      deleteService: deleteAdminService,
      clearOwnership: (serviceId) => clearServiceOwnership(serviceId, { actorName: 'Admin', storage: st }),
    });

  it('clears the ownership record and private note of a removed custom guide', () => {
    saveAdminService({ name: 'Custom Guide', category: 'Identity', shortDescription: 'x' }, 'Editor Eve');
    const custom = getAdminServices().find((s) => s.name === 'Custom Guide');
    assign(custom.id, { reviewerId: 'u1', privateNote: 'orphan-check-note' });
    expect(getOwnershipMap(storage)[custom.id]).toBeDefined();

    const result = removeGuide(custom.id, storage);
    expect(result.outcome).toBe('removed');
    expect(getOwnershipMap(storage)[custom.id]).toBeUndefined();
    expect(JSON.stringify([...storage.data.values()])).not.toContain('orphan-check-note');
  });

  it('still removes the guide when clearing ownership throws', () => {
    saveAdminService({ name: 'Custom Guide', category: 'Identity', shortDescription: 'x' }, 'Editor Eve');
    const custom = getAdminServices().find((s) => s.name === 'Custom Guide');
    const result = removeServiceGuide({
      id: custom.id,
      name: 'Custom Guide',
      builtIn: false,
      actor: 'Admin',
      deleteService: deleteAdminService,
      clearOwnership: () => {
        throw new Error('boom');
      },
    });
    expect(result.outcome).toBe('removed');
  });
});

describe('public isolation', () => {
  const srcDir = fileURLToPath(new URL('..', import.meta.url));
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it('is imported only by admin code, never by public pages or components', () => {
    const importers = walk(srcDir)
      .filter((f) => /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes('serviceOwnershipService'))
      .map((f) => relative(srcDir, f).split(sep).join('/'))
      .sort();
    expect(importers).toEqual([
      'components/admin/ServiceOwnershipModal.jsx',
      'components/admin/ServiceRecordList.jsx',
      'pages/Admin.jsx',
    ]);
  });

  it('keeps the private note and reviewer out of what the public service functions return', () => {
    const target = getAllServices()[0];
    assign(target.id, { reviewerId: 'u1', team: 'Revenue-Team-X', privateNote: 'PRIVATE-NOTE-9f3a' });
    const publicData = JSON.stringify([getAllServices(), getServiceById(target.id)]);
    expect(publicData).not.toContain('PRIVATE-NOTE-9f3a');
    expect(publicData).not.toContain('Revenue-Team-X');
    expect(publicData).not.toContain('Priya');
  });
});
