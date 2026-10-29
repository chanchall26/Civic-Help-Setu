import { MOCK_SERVICES } from '../data/services';
import { sanitizeTextFields } from '../utils/safeContent';
import { logDiagnostic } from '../utils/diagnostics';

// Where the admin dashboard keeps guides it added or edited (see adminService).
export const CUSTOM_SERVICES_KEY = 'civicbridge_custom_services';

const isUsableService = (svc) =>
  Boolean(svc) && typeof svc === 'object' && typeof svc.id === 'string' && typeof svc.name === 'string';

/**
 * The one list of service guides every page should read: the built-in guides
 * with the admin's saved guides merged on top (a saved guide with the same id
 * replaces the built-in one). Read it once per mount or per action, it does a
 * localStorage read and JSON parse each call.
 */
export const getAllServices = ({ includeArchived = false } = {}) => {
  const all = readAllServices();
  return includeArchived ? all : all.filter((s) => s.archived !== true);
};

const readAllServices = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_SERVICES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Saved guides are plain text: anything that parses as markup is removed on the way in.
    const custom = Array.isArray(parsed) ? parsed.filter(isUsableService).map((svc) => sanitizeTextFields(svc)) : [];
    if (custom.length === 0) return [...MOCK_SERVICES];
    const customById = new Map(custom.map((c) => [c.id, c]));
    const builtInIds = new Set(MOCK_SERVICES.map((b) => b.id));
    // An edited built-in guide keeps its place in the list, new guides go after the built-in ones.
    return MOCK_SERVICES.map((b) => customById.get(b.id) || b).concat(
      custom.filter((c) => !builtInIds.has(c.id))
    );
  } catch (err) {
    logDiagnostic('Failed to load saved service guides', err);
    return [...MOCK_SERVICES];
  }
};

/**
 * The built-in guides as the assistant and the search index should see them:
 * a saved edit replaces the built-in text, archived ones are left out, and
 * guides the admin added are not included (they keep their own flow).
 */
export const getActiveBuiltInServices = () => {
  const builtInIds = new Set(MOCK_SERVICES.map((b) => b.id));
  return getAllServices().filter((s) => builtInIds.has(s.id));
};

// Archived guides are still found by id, so direct links and saved references keep working.
export const getServiceById = (id) => getAllServices({ includeArchived: true }).find((s) => s.id === id) || null;
