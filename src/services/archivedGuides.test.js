import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_SERVICES } from '../data/services';
import { setCurrentActor } from './accessControl';
import { archiveAdminServices, restoreAdminServices, saveAdminService } from './adminService';
import { getActiveBuiltInServices } from './serviceCatalog';
import { askCivicAssistant } from '../ai/civicAssistant';
import { buildPersonalizedContext } from '../ai/contextRecommender';
import { resolveFollowUpQuery } from '../ai/conversationContext';
import { ragIndex } from '../ai/ragIngestionService';
import { retrieveGroundedChunks } from '../ai/sourceGroundedRetriever';

setCurrentActor({ role: 'admin', username: 'Test Admin' });

const makeStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};

const target = MOCK_SERVICES.find((s) => s.id === 'pan-card');
let storage;
beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
  ragIndex.buildIndex();
});

describe('archived built-in guides are not quoted', () => {
  it('is left out of the active built-in list and back after restore', () => {
    archiveAdminServices([target.id]);
    expect(getActiveBuiltInServices().some((s) => s.id === target.id)).toBe(false);
    restoreAdminServices([target.id]);
    expect(getActiveBuiltInServices().some((s) => s.id === target.id)).toBe(true);
  });

  it('assistant does not answer from an archived guide', async () => {
    const before = await askCivicAssistant('pan card fees');
    expect(JSON.stringify(before)).toContain(target.name);
    archiveAdminServices([target.id]);
    const after = await askCivicAssistant('pan card fees');
    expect(JSON.stringify(after)).not.toContain(target.name);
  });

  it('context recommender skips an archived saved guide', () => {
    storage.setItem('civicbridge_saved_rich', JSON.stringify([{ serviceId: target.id, folder: 'x', priority: 'high' }]));
    expect(buildPersonalizedContext().savedServices.length).toBe(1);
    archiveAdminServices([target.id]);
    expect(buildPersonalizedContext().savedServices).toEqual([]);
  });

  it('follow-up resolution does not attach an archived guide', () => {
    archiveAdminServices([target.id]);
    const q = resolveFollowUpQuery('How much are the fees?', [{ role: 'assistant', serviceId: target.id }]);
    expect(q).not.toContain(target.name);
  });

  it('rag index drops an archived guide even when already built, and takes it back on restore', () => {
    expect(ragIndex.getChunks().some((c) => c.serviceId === target.id)).toBe(true);
    archiveAdminServices([target.id]);
    retrieveGroundedChunks('pan card documents');
    expect(ragIndex.getChunks().some((c) => c.serviceId === target.id)).toBe(false);
    restoreAdminServices([target.id]);
    retrieveGroundedChunks('pan card documents');
    expect(ragIndex.getChunks().some((c) => c.serviceId === target.id)).toBe(true);
  });
});

describe('editing an archived guide', () => {
  it('keeps it archived and it can still be restored', () => {
    archiveAdminServices([target.id]);
    saveAdminService({ ...target, archived: true, name: 'PAN Card (edited)' });
    expect(restoreAdminServices([target.id]).changed).toBe(1);
    expect(getActiveBuiltInServices().find((s) => s.id === target.id).name).toBe('PAN Card (edited)');
  });

  it('a partial edit payload does not drop the archived flag or required fields', () => {
    archiveAdminServices([target.id]);
    saveAdminService({ id: target.id, fees: 'Rs 100' });
    expect(restoreAdminServices([target.id]).changed).toBe(1);
  });
});
