import { getActiveBuiltInServices } from '../services/serviceCatalog';
import { redactPersonalData } from '../utils/dataMinimization';
import { logDiagnostic } from '../utils/diagnostics';

const PRIVACY_CONSENT_KEY = 'civicbridge_ai_context_consent';

export const getAIContextConsent = () => {
  try {
    const raw = localStorage.getItem(PRIVACY_CONSENT_KEY);
    return raw ? JSON.parse(raw) : true; // Enabled by default
  } catch {
    return true;
  }
};

export const setAIContextConsent = (enabled) => {
  try {
    localStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(enabled));
  } catch (err) {
    logDiagnostic('Failed to set AI privacy consent:', err);
  }
};

/**
 * Strips potential PII (Aadhaar, PAN, phone numbers, email, reference ids) before
 * any text is sent to an external service.
 */
export const sanitizeForPrivacy = (text = '') => redactPersonalData(text);

/**
 * Builds non-sensitive personalized profile context from saved services and recent activity.
 */
export const buildPersonalizedContext = () => {
  const consent = getAIContextConsent();
  if (!consent) {
    return {
      hasConsent: false,
      contextSnippet: 'User has opted out of personalized profile context.',
      savedServices: [],
      proactiveRecommendations: [],
    };
  }

  let savedItems = [];
  try {
    const raw = localStorage.getItem('civicbridge_saved_rich');
    savedItems = raw ? JSON.parse(raw) : [];
  } catch {
    savedItems = [];
  }

  const activeServices = getActiveBuiltInServices();
  const matchingServices = savedItems
    .map((item) => {
      const found = activeServices.find((s) => s.id === item.serviceId);
      return found ? { ...found, folder: item.folder, priority: item.priority } : null;
    })
    .filter(Boolean);

  const proactiveRecommendations = [];

  matchingServices.forEach((svc) => {
    if (svc.id === 'birth-certificate') {
      proactiveRecommendations.push({
        id: 'rec_birth',
        title: 'Birth Certificate Verification',
        advice: 'Carry the hospital discharge summary and both parents’ identity proofs.',
        actionPrompt: 'What documents do I need for a late birth certificate registration?',
      });
    } else if (svc.id === 'driving-license') {
      proactiveRecommendations.push({
        id: 'rec_dl',
        title: 'Driving License Learner Period',
        advice: 'You must hold a valid Learner’s License for at least 30 days before booking a permanent driving test.',
        actionPrompt: 'How do I book a driving license road test slot online on Parivahan?',
      });
    } else if (svc.id === 'pan-card') {
      proactiveRecommendations.push({
        id: 'rec_pan',
        title: 'Instant e-PAN Aadhaar OTP',
        advice: 'Ensure your mobile number is linked to Aadhaar for paperless e-PAN generation in 10 minutes.',
        actionPrompt: 'How does paperless instant e-PAN generation work?',
      });
    }
  });

  const contextSnippet = matchingServices.length > 0
    ? `User currently has ${matchingServices.length} saved services: ${matchingServices.map((s) => s.name).join(', ')}.`
    : 'No saved services yet.';

  return {
    hasConsent: true,
    contextSnippet,
    savedServices: matchingServices,
    proactiveRecommendations: proactiveRecommendations.slice(0, 3),
  };
};

/**
 * Detects ambiguous civic queries and generates clarifying follow-up questions.
 */
export const detectAmbiguousIntent = (query = '') => {
  const q = query.toLowerCase();

  if (q.includes('license') && !q.includes('learner') && !q.includes('driving') && !q.includes('commercial') && !q.includes('trade')) {
    return {
      isAmbiguous: true,
      followUpOptions: [
        'Apply for a new Learner Driving License',
        'Upgrade to Permanent Driving License',
        'Renew an expired Driving License',
        'Commercial Transport Vehicle License',
      ],
      clarificationPrompt: 'Which type of license are you seeking assistance with?',
    };
  }

  if (q.includes('certificate') && !q.includes('birth') && !q.includes('caste') && !q.includes('income') && !q.includes('death')) {
    return {
      isAmbiguous: true,
      followUpOptions: [
        'Birth Certificate Registration',
        'Income Certificate for Fee Concession',
        'Caste / Community Certificate',
        'Domicile / Residence Certificate',
      ],
      clarificationPrompt: 'Which certificate procedure would you like guidance on?',
    };
  }

  if (q.includes('pension') && !q.includes('old age') && !q.includes('widow') && !q.includes('disability') && !q.includes('epfo')) {
    return {
      isAmbiguous: true,
      followUpOptions: [
        'Old Age / Senior Citizen Pension (IGNOAPS)',
        'Widow / Destitute Women Pension',
        'Disability Pension Scheme',
        'EPFO / National Pension System (NPS)',
      ],
      clarificationPrompt: 'Which government pension scheme are you inquiring about?',
    };
  }

  return { isAmbiguous: false, followUpOptions: [], clarificationPrompt: '' };
};
