import { requirePermission } from './accessControl';
import { MOCK_SERVICES } from '../data/services';
import { normalizeName } from './serviceImportService';
import { CUSTOM_SERVICES_KEY, getAllServices } from './serviceCatalog';
import { planBulkArchive, planBulkRestore, withArchived, withRestored, describePlan } from './serviceLifecycle';
import { logDiagnostic } from '../utils/diagnostics';

const SERVICES_KEY = CUSTOM_SERVICES_KEY;
const REPORTS_KEY = 'civicbridge_error_reports';
const AUDIT_LOGS_KEY = 'civicbridge_audit_logs';
const USERS_KEY = 'civicbridge_rbac_users';
const SUBMISSIONS_KEY = 'civicbridge_service_submissions';

const DEFAULT_REPORTS = [
  {
    id: 'rep-101',
    serviceId: 'birth-certificate',
    serviceName: 'Birth Certificate',
    issueType: 'Broken URL / 404 Link',
    description: 'The state portal redirect for municipal birth registration in Karnataka returns 404.',
    reporterEmail: 'citizen.karan@gmail.com',
    createdAt: '2 hours ago',
    status: 'pending',
  },
  {
    id: 'rep-102',
    serviceId: 'driving-license',
    serviceName: 'Driving License',
    issueType: 'Outdated Fees',
    description: 'RTO revised smart card issuance charges to ₹300 starting last month.',
    reporterEmail: 'meera.s@outlook.com',
    createdAt: '1 day ago',
    status: 'pending',
  },
  {
    id: 'rep-103',
    serviceId: 'pan-card',
    serviceName: 'PAN Card',
    issueType: 'Missing Document Step',
    description: 'Minor PAN applications now require Form 49A signed by legal guardian.',
    reporterEmail: 'taxpayer.dev@gmail.com',
    createdAt: '3 days ago',
    status: 'pending',
  },
];

const DEFAULT_USERS = [
  { id: 'usr-1', username: 'SuperAdmin', email: 'admin@civicbridge.setu', role: 'admin', joinedAt: '2026-09-01' },
  { id: 'usr-2', username: 'PriyaSharma', email: 'priya.moderator@delhi.gov.in', role: 'moderator', joinedAt: '2026-09-15' },
  { id: 'usr-3', username: 'AmitEditor', email: 'amit.verma@civic.org', role: 'editor', joinedAt: '2026-10-02' },
  { id: 'usr-4', username: 'CitizenRamesh', email: 'ramesh.patel@gmail.com', role: 'citizen', joinedAt: '2026-10-10' },
  { id: 'usr-5', username: 'SnehaReddy', email: 'sneha.reddy@gmail.com', role: 'citizen', joinedAt: '2026-10-18' },
];

const DEFAULT_AUDIT_LOGS = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    action: 'SERVICE_UPDATED',
    actor: 'SuperAdmin',
    target: 'Birth Certificate',
    details: 'Updated processing fees and state municipal links.',
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    action: 'ROLE_CHANGED',
    actor: 'SuperAdmin',
    target: 'PriyaSharma (usr-2)',
    details: 'Promoted user from Editor to Moderator.',
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
    action: 'REPORT_RESOLVED',
    actor: 'PriyaSharma',
    target: 'rep-102 (Driving License)',
    details: 'Verified RTO fee change with Parivahan portal and published correction.',
  },
];

const DEFAULT_SUBMISSIONS = [
  {
    id: 'sub-201',
    name: 'Senior Citizen Identity Card',
    category: 'Identity',
    shortDescription: 'Official identity and concession card for citizens aged 60 and above.',
    processingTime: '7 - 14 days',
    fees: 'Free of Cost',
    officialUrl: 'https://socialjustice.gov.in',
    submittedBy: 'AmitEditor',
    contributorEmail: 'amit.verma@civic.org',
    status: 'pending',
    submittedAt: '2026-10-20',
  },
  {
    id: 'sub-202',
    name: 'Disability Certificate & UDID Card',
    category: 'Welfare',
    shortDescription: 'Unique ID for Persons with Disabilities providing access to welfare schemes.',
    processingTime: '15 - 30 days',
    fees: 'Free of Cost',
    officialUrl: 'https://www.swavlambancard.gov.in',
    submittedBy: 'CitizenRamesh',
    contributorEmail: 'ramesh.patel@gmail.com',
    status: 'pending',
    submittedAt: '2026-10-21',
  },
];

// Same merged list the public pages read, see serviceCatalog.js.
// The admin list includes archived guides; the lifecycle view separates them.
export const getAdminServices = () => getAllServices({ includeArchived: true });

export const saveAdminService = (serviceData, actorName = 'SuperAdmin') => {
  requirePermission('services.write');
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    const custom = raw ? JSON.parse(raw) : [];

    let updated;
    const isEdit = serviceData.id && custom.some((s) => s.id === serviceData.id);

    if (isEdit) {
      updated = custom.map((s) => (s.id === serviceData.id ? { ...s, ...serviceData } : s));
    } else {
      const id =
        serviceData.id ||
        serviceData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const newService = {
        ...serviceData,
        id,
        lastVerified: new Date().toISOString().split('T')[0],
      };
      updated = [newService, ...custom];
    }

    localStorage.setItem(SERVICES_KEY, JSON.stringify(updated));

    addAuditLog({
      action: isEdit ? 'SERVICE_UPDATED' : 'SERVICE_CREATED',
      actor: actorName,
      target: serviceData.name,
      details: isEdit ? 'Modified service fields and source references.' : 'Created new service catalog entry.',
    });

    return getAdminServices();
  } catch (err) {
    logDiagnostic('Failed to save service', err);
    return getAdminServices();
  }
};

// Adds validated services from an import in a single localStorage write, so a
// failed write (e.g. storage full) leaves the existing catalog untouched.
// Duplicates are checked again here because the catalog can change between the
// preview and the confirm (another tab or another admin).
export const importAdminServices = (services, actorName = 'SuperAdmin') => {
  requirePermission('services.import');
  let custom;
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    custom = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(custom)) throw new Error('stored services are not a list');
  } catch (err) {
    logDiagnostic('Failed to read services before import', err);
    return { ok: false, imported: 0, skipped: [], error: 'Existing service data could not be read, so nothing was imported.' };
  }

  const current = [...MOCK_SERVICES.filter((b) => !custom.some((c) => c.id === b.id)), ...custom];
  const ids = new Set(current.map((s) => s.id));
  const names = new Set(current.map((s) => normalizeName(s.name)));
  const today = new Date().toISOString().split('T')[0];
  const accepted = [];
  const skipped = [];

  for (const svc of services) {
    const key = normalizeName(svc.name);
    if (ids.has(svc.id) || names.has(key)) {
      skipped.push(svc.name);
      continue;
    }
    ids.add(svc.id);
    names.add(key);
    accepted.push({ ...svc, lastVerified: svc.lastVerified || today });
  }

  if (accepted.length === 0) {
    return { ok: true, imported: 0, skipped, error: null };
  }

  try {
    localStorage.setItem(SERVICES_KEY, JSON.stringify([...accepted, ...custom]));
  } catch (err) {
    logDiagnostic('Failed to save imported services', err);
    return { ok: false, imported: 0, skipped, error: 'Saving failed (browser storage may be full). No services were imported.' };
  }

  addAuditLog({
    action: 'SERVICES_IMPORTED',
    actor: actorName,
    target: `${accepted.length} service${accepted.length === 1 ? '' : 's'}`,
    details:
      `Bulk import added: ${accepted.map((s) => s.name).join(', ')}.` +
      (skipped.length ? ` Skipped ${skipped.length} that already existed.` : ''),
  });
  return { ok: true, imported: accepted.length, skipped, error: null };
};

// True when a saved copy of this id exists on this device. For a built-in guide
// that copy is a local edit sitting on top of the original text.
export const hasLocalServiceCopy = (id) => {
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    const custom = raw ? JSON.parse(raw) : [];
    return Array.isArray(custom) && custom.some((s) => s.id === id);
  } catch {
    return false;
  }
};

// Only the saved (custom) list can be changed here, so the audit trail follows
// what actually happened:
//   - id not in the saved list (a built-in guide nobody edited): nothing is
//     written and nothing is logged, the guide stays in the directory
//   - built-in guide with a saved edit: the edit is cleared, logged as an update
//   - custom guide: removed, logged as a deletion
// A failed write is not logged either, the caller sees the unchanged list.
export const deleteAdminService = (id, actorName = 'SuperAdmin') => {
  requirePermission('services.delete');
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    const custom = raw ? JSON.parse(raw) : [];
    const target = custom.find((s) => s.id === id);
    if (!target) return getAdminServices();

    const updated = custom.filter((s) => s.id !== id);
    localStorage.setItem(SERVICES_KEY, JSON.stringify(updated));

    const builtIn = MOCK_SERVICES.some((s) => s.id === id);
    addAuditLog({
      action: builtIn ? 'SERVICE_UPDATED' : 'SERVICE_DELETED',
      actor: actorName,
      target: target.name || id,
      details: builtIn
        ? `Cleared locally saved changes to built-in guide ${id}. The guide stays in the directory with its original text.`
        : `Service entry ${id} permanently removed from directory.`,
    });

    return getAdminServices();
  } catch (err) {
    logDiagnostic('Failed to delete service', err);
    return getAdminServices();
  }
};

// Archive / restore. The record is kept (same id), only the `archived` flag
// changes. The plan is recomputed from fresh storage, so stale ids and records
// changed in another tab are skipped instead of failing the batch. A built-in
// guide is archived through a saved copy on top of it, like an edit.
// Known limit: this reads storage and writes it back without a lock, so two
// tabs archiving at the same moment can overwrite each other's change (last
// write wins). localStorage has no atomic update, and admin use is rare.
const applyLifecycle = (kind, ids, actorName) => {
  const archiving = kind === 'archive';
  const failure = (error) => ({ ok: false, changed: 0, plan: null, error, services: getAdminServices() });
  let custom;
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    custom = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(custom)) throw new Error('stored services are not a list');
  } catch (err) {
    logDiagnostic('Failed to read services before archive/restore', err);
    return failure('Existing service data could not be read, so nothing was changed.');
  }

  const all = getAdminServices();
  const plan = archiving ? planBulkArchive(ids, all) : planBulkRestore(ids, all);
  if (plan.toChange.length === 0) {
    return { ok: true, changed: 0, plan, error: null, services: all };
  }

  // Full timestamp, so the stored value does not depend on which day the admin's timezone is on.
  const today = new Date().toISOString();
  const changeIds = new Set(plan.toChange.map((c) => c.id));
  const next = [...custom];
  for (const svc of all) {
    if (!changeIds.has(svc.id)) continue;
    const updated = archiving ? withArchived(svc, today) : withRestored(svc);
    const at = next.findIndex((c) => c.id === svc.id);
    if (at >= 0) next[at] = updated;
    else next.unshift(updated);
  }

  try {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(next));
  } catch (err) {
    logDiagnostic('Failed to save archive/restore', err);
    return failure('Saving failed (browser storage may be full). Nothing was changed.');
  }

  const skipped = describePlan(plan);
  addAuditLog({
    action: archiving ? 'SERVICES_ARCHIVED' : 'SERVICES_RESTORED',
    actor: actorName,
    target: `${plan.toChange.length} service${plan.toChange.length === 1 ? '' : 's'}`,
    details:
      `${archiving ? 'Archived' : 'Restored'}: ${plan.toChange.map((c) => c.name).join(', ')}.` +
      (skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''),
  });
  return { ok: true, changed: plan.toChange.length, plan, error: null, services: getAdminServices() };
};

export const archiveAdminServices = (ids, actorName = 'SuperAdmin') => {
  requirePermission('services.archive');
  return applyLifecycle('archive', ids, actorName);
};

export const restoreAdminServices = (ids, actorName = 'SuperAdmin') => {
  requirePermission('services.archive');
  return applyLifecycle('restore', ids, actorName);
};

const readReports = () => {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(DEFAULT_REPORTS));
      return DEFAULT_REPORTS;
    }
    return JSON.parse(raw);
  } catch (err) {
    logDiagnostic('Failed to load error reports', err);
    return DEFAULT_REPORTS;
  }
};

export const submitErrorReport = ({ serviceId, serviceName, issueType, description, reporterEmail }) => {
  const current = readReports();
  const newReport = {
    id: `rep-${Date.now()}`,
    serviceId: serviceId || 'general',
    serviceName: serviceName || 'General Platform',
    issueType: issueType || 'Incorrect Information',
    description: description || 'User reported an inaccuracy in this guide.',
    reporterEmail: reporterEmail || 'anonymous.citizen@civicbridge.org',
    createdAt: 'Just now',
    status: 'pending',
  };
  const updated = [newReport, ...current];
  localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
  return updated;
};

export const resolveReport = (id, resolution = 'Verified and updated', actorName = 'SuperAdmin') => {
  requirePermission('reports.resolve');
  const current = readReports();
  const updated = current.map((r) =>
    r.id === id ? { ...r, status: 'resolved', resolutionNotes: resolution } : r
  );
  localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));

  addAuditLog({
    action: 'REPORT_RESOLVED',
    actor: actorName,
    target: id,
    details: `Resolved report with notes: "${resolution}"`,
  });

  return updated;
};

export const dismissReport = (id) => {
  requirePermission('reports.dismiss');
  const current = readReports();
  const updated = current.filter((r) => r.id !== id);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
  return updated;
};

/* --- AUDIT LOGS --- */
const readAuditLogs = () => {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!raw) {
      localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(DEFAULT_AUDIT_LOGS));
      return DEFAULT_AUDIT_LOGS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_AUDIT_LOGS;
  }
};

export const addAuditLog = ({ action, actor = 'SuperAdmin', target = '', details = '' }) => {
  requirePermission('audit.write');
  const logs = readAuditLogs();
  const newLog = {
    id: `log_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    actor,
    target,
    details,
  };
  logs.unshift(newLog);
  try {
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs.slice(0, 150))); // Keep last 150
  } catch (err) {
    logDiagnostic('Failed to save audit log:', err);
  }
  return logs;
};

/* --- USER RBAC ROLE MANAGEMENT --- */
const readUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_USERS;
  }
};

export const updateUserRole = (userId, newRole, customPermissions = {}, actorName = 'SuperAdmin') => {
  requirePermission('users.updateRole');
  const users = readUsers();
  const updated = users.map((u) =>
    u.id === userId ? { ...u, role: newRole, permissions: customPermissions } : u
  );
  localStorage.setItem(USERS_KEY, JSON.stringify(updated));

  const targetUser = users.find((u) => u.id === userId);
  addAuditLog({
    action: 'ROLE_CHANGED',
    actor: actorName,
    target: `${targetUser?.username || userId} (${userId})`,
    details: `Changed role to ${newRole.toUpperCase()}.`,
  });

  return updated;
};

/* --- COMMUNITY SUBMISSION REVIEW QUEUE --- */
const readSubmissions = () => {
  try {
    const raw = localStorage.getItem(SUBMISSIONS_KEY);
    if (!raw) {
      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
      return DEFAULT_SUBMISSIONS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SUBMISSIONS;
  }
};

export const approveServiceSubmission = (submissionId, reviewNotes = '', actorName = 'SuperAdmin') => {
  requirePermission('submissions.review');
  const submissions = readSubmissions();
  const target = submissions.find((s) => s.id === submissionId);
  if (!target) return submissions;

  // Publish to custom services
  saveAdminService(
    {
      name: target.name,
      category: target.category,
      shortDescription: target.shortDescription,
      processingTime: target.processingTime,
      fees: target.fees,
      officialSources: [{ name: 'Government Official Portal', url: target.officialUrl, verified: true }],
      steps: [{ title: 'Online Registration', description: 'Apply via the official portal link.' }],
      documents: ['Aadhaar Card', 'Age/Address Proof'],
    },
    actorName
  );

  const updated = submissions.map((s) =>
    s.id === submissionId ? { ...s, status: 'approved', reviewNotes } : s
  );
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));

  addAuditLog({
    action: 'SUBMISSION_APPROVED',
    actor: actorName,
    target: target.name,
    details: `Approved community submission and published to live directory.`,
  });

  return updated;
};

export const rejectServiceSubmission = (submissionId, reviewNotes = '', actorName = 'SuperAdmin') => {
  requirePermission('submissions.review');
  const submissions = readSubmissions();
  const target = submissions.find((s) => s.id === submissionId);
  const updated = submissions.map((s) =>
    s.id === submissionId ? { ...s, status: 'rejected', reviewNotes } : s
  );
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));

  addAuditLog({
    action: 'SUBMISSION_REJECTED',
    actor: actorName,
    target: target?.name || submissionId,
    details: `Rejected submission: "${reviewNotes}"`,
  });

  return updated;
};

/* --- Guarded reads: admin-only data. Internal code uses the unguarded read* helpers above. --- */
export const getReports = () => {
  requirePermission('reports.read');
  return readReports();
};

export const getAuditLogs = () => {
  requirePermission('audit.read');
  return readAuditLogs();
};

export const getUserList = () => {
  requirePermission('users.read');
  return readUsers();
};

export const getServiceSubmissions = () => {
  requirePermission('submissions.read');
  return readSubmissions();
};
