import { getActiveBuiltInServices } from '../services/serviceCatalog.js';

// Real civic scenarios shown before the first question is asked.
export const STARTER_PROMPTS = [
  { label: 'Newborn baby', prompt: 'My baby was just born. How do I get a birth certificate?' },
  { label: 'Lost Aadhaar', prompt: 'I lost my Aadhaar card. What should I do?' },
  { label: 'Driving licence', prompt: 'What documents do I need for a driving license?' },
  { label: 'Passport', prompt: 'How do I apply for a new passport?' },
  { label: 'Farmer support', prompt: 'Am I eligible for PM Kisan Samman Nidhi?' },
  { label: 'Complaint', prompt: 'How do I file a public grievance against a department?' },
];

// Cap on messages kept in session storage so history stays small.
export const MAX_STORED_MESSAGES = 60;

const GENERIC_WORDS = new Set([
  'application', 'certificate', 'card', 'registration', 'enrollment',
  'file', 'public', 'new', 'number', 'permanent', 'account',
]);

const tokenize = (text) =>
  (text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const serviceKeywords = (service) =>
  [...tokenize(service.name), ...tokenize(service.id)].filter(
    (t) => t.length >= 3 && !GENERIC_WORDS.has(t)
  );

const mentionsAnyService = (query) => {
  const words = new Set(tokenize(query));
  return getActiveBuiltInServices().some((s) => serviceKeywords(s).some((k) => words.has(k)));
};

// Service id of the latest assistant answer, only if no user message follows it
const lastAssistantServiceId = (messages) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return messages[i].serviceId || null;
  }
  return null;
};

/**
 * If the question is a short follow-up that does not name a service
 * ("How much are the fees?"), attach the service from the previous answer
 * so retrieval stays on topic. Otherwise the query is returned unchanged.
 */
export const resolveFollowUpQuery = (query, messages = []) => {
  const trimmed = (query || '').trim();
  if (!trimmed || tokenize(trimmed).length > 10) return trimmed;
  if (mentionsAnyService(trimmed)) return trimmed;

  const serviceId = lastAssistantServiceId(messages);
  const service = serviceId && getActiveBuiltInServices().find((s) => s.id === serviceId);
  if (!service) return trimmed;

  return `${trimmed.replace(/[?.!]+$/, '')} for ${service.name}`;
};

export const getLastUserMessage = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i];
  }
  return null;
};

export const hasUserMessages = (messages = []) =>
  messages.some((m) => m.role === 'user');

export const trimHistory = (messages = [], max = MAX_STORED_MESSAGES) =>
  messages.length > max ? messages.slice(messages.length - max) : messages;
