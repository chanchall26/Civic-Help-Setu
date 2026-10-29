import { getActiveBuiltInServices } from '../services/serviceCatalog';
import { FAQ_DATABASE } from '../data/faq_database';

export const askCivicAssistant = async (query, conversationContext = []) => {
  // Simulate AI network processing latency
  await new Promise((resolve) => setTimeout(resolve, 600));

  const lowerQuery = query.toLowerCase().trim();

  // 1. Direct Service Guide matching
  const serviceMatch = getActiveBuiltInServices().find((s) => {
    const sName = s.name.toLowerCase();
    const sId = s.id.toLowerCase();
    const sCat = s.category.toLowerCase();

    return (
      lowerQuery.includes(sName) ||
      lowerQuery.includes(sId) ||
      (sCat && lowerQuery.includes(sCat)) ||
      (s.id === 'birth-certificate' && (lowerQuery.includes('born') || lowerQuery.includes('baby') || lowerQuery.includes('birth'))) ||
      (s.id === 'driving-license' && (lowerQuery.includes('drive') || lowerQuery.includes('dl') || lowerQuery.includes('rto') || lowerQuery.includes('vehicle'))) ||
      (s.id === 'pan-card' && (lowerQuery.includes('tax') || lowerQuery.includes('income tax') || lowerQuery.includes('pan'))) ||
      (s.id === 'aadhaar-card' && (lowerQuery.includes('lost') || lowerQuery.includes('uidai') || lowerQuery.includes('biometric') || lowerQuery.includes('aadhaar')))
    );
  });

  if (serviceMatch) {
    const wantsFees = lowerQuery.includes('fee') || lowerQuery.includes('cost') || lowerQuery.includes('charge') || lowerQuery.includes('price');
    const wantsDocs = lowerQuery.includes('document') || lowerQuery.includes('paper') || lowerQuery.includes('proof') || lowerQuery.includes('need');
    const wantsTime = lowerQuery.includes('time') || lowerQuery.includes('day') || lowerQuery.includes('fast') || lowerQuery.includes('long');

    let dynamicSummary = serviceMatch.shortDescription;
    if (wantsFees) {
      dynamicSummary = `Official Fees for ${serviceMatch.name}: ${serviceMatch.fees}. Most centers accept UPI, Netbanking, or Challan.`;
    } else if (wantsDocs) {
      dynamicSummary = `Key prerequisite documents for ${serviceMatch.name}: ${serviceMatch.documents.join(', ')}.`;
    } else if (wantsTime) {
      dynamicSummary = `Estimated processing duration for ${serviceMatch.name}: ${serviceMatch.processingTime}. Online fast-track applications often process sooner.`;
    }

    const suggestions = [
      `What are the mandatory documents for ${serviceMatch.name}?`,
      `How much are the official fees?`,
      `Where can I apply online?`,
    ];

    return {
      status: 'success',
      data: {
        title: serviceMatch.name,
        summary: dynamicSummary,
        steps: serviceMatch.steps || [],
        officialSources: serviceMatch.officialSources || [],
        documents: serviceMatch.documents || [],
        category: serviceMatch.category,
        processingTime: serviceMatch.processingTime,
        fees: serviceMatch.fees,
      },
      serviceId: serviceMatch.id,
      suggestions,
    };
  }

  // 2. Keyword Scoring Search against FAQ Database
  let bestMatch = null;
  let highestScore = 0;

  for (const faq of FAQ_DATABASE) {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = faq;
    }
  }

  if (bestMatch && highestScore > 0) {
    return {
      status: 'success',
      data: {
        title: bestMatch.title,
        summary: bestMatch.summary,
        steps: [],
        officialSources: [],
      },
      serviceId: null,
      suggestions: bestMatch.suggestions || [
        'How to apply for a Passport?',
        'Check Aadhaar status',
        'Download Income Certificate',
      ],
    };
  }

  // 3. Fallback resolution with guided queries
  return {
    status: 'success',
    data: {
      title: "I couldn't locate an exact government service match.",
      summary:
        "My knowledge base contains verified procedures for Passports, Aadhaar, Birth/Death Certificates, Driving Licenses, Voter IDs, Property Tax, and Ration Cards. Try specifying the department or required document.",
      steps: [],
      officialSources: [
        {
          name: 'National Government Services Portal (Services.india.gov.in)',
          url: 'https://services.india.gov.in',
          verified: true,
        },
      ],
    },
    serviceId: null,
    suggestions: [
      'How to apply for a Passport?',
      'Check Aadhaar card enrollment',
      'Download Birth Certificate guide',
    ],
  };
};
