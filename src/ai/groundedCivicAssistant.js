/**
 * Grounded Civic Assistant (#77)
 * Implements a Retrieval-Augmented Generation (RAG) assistant that synthesizes answers
 * strictly grounded in retrieved official service documents and sections.
 */

import { retrieveGroundedChunks } from './sourceGroundedRetriever.js';
import { getActiveBuiltInServices } from '../services/serviceCatalog.js';

export const MANDATORY_LEGAL_DISCLAIMER =
  'Notice: This guidance is retrieved from approved civic service guidelines and does not constitute an official government eligibility decision. Rules, deadlines, and fees may vary by municipality.';

/**
 * Answers a user query strictly using retrieved service knowledge.
 *
 * @param {string} query - Citizen question or query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Grounded response payload
 */
export async function askGroundedCivicAssistant(query, options = {}) {
  // Simulate retrieval and inference latency
  await new Promise((resolve) => setTimeout(resolve, 450));

  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return {
      status: 'error',
      data: {
        title: 'Empty Query',
        summary: 'Please enter a civic question or name of a government service.',
        officialSources: [],
        disclaimer: MANDATORY_LEGAL_DISCLAIMER,
      },
      grounded: false,
      serviceId: null,
      suggestions: ['How to apply for a Passport?', 'Aadhaar card update documents', 'Birth certificate fees'],
    };
  }

  // 1. Perform Source-Grounded Retrieval
  const retrieval = retrieveGroundedChunks(trimmedQuery, options);

  // 2. Handle out-of-scope or unsupported inquiries where no verified sources exist
  if (!retrieval.grounded || retrieval.retrievedChunks.length === 0) {
    return {
      status: 'unsupported',
      grounded: false,
      confidenceScore: retrieval.confidenceScore,
      data: {
        title: 'No Verified Government Source Found',
        summary: `We could not find verified government documentation or official guidelines supporting this request ("${trimmedQuery}"). To prevent inaccurate information, Civic-Help-Setu does not generate unverified answers.`,
        missingInformationNotice: 'Missing or unsupported claims: No official government guidelines were retrieved for this specific question.',
        officialSources: [
          {
            name: 'National Government Services Portal (Direct Directory)',
            url: 'https://services.india.gov.in',
            verified: true,
          },
        ],
        disclaimer: MANDATORY_LEGAL_DISCLAIMER,
      },
      serviceId: null,
      suggestions: [
        'How to apply for a Passport?',
        'What documents are needed for Driving License?',
        'How to register a Birth Certificate?',
      ],
    };
  }

  // 3. Grounded Answer Synthesis
  const topChunk = retrieval.retrievedChunks[0];
  const service = getActiveBuiltInServices().find((s) => s.id === topChunk.serviceId) || null;

  // Synthesize answer text grounded exclusively in retrieved chunks
  const chunkContents = retrieval.retrievedChunks.map((c) => c.content);
  const primarySummary = retrieval.retrievedChunks
    .map((c) => `[${c.sectionTitle}]: ${c.content}`)
    .join('\n\n');

  // Generate contextual suggestions
  const serviceName = topChunk.serviceName;
  const suggestions = [
    `What are the official fees for ${serviceName}?`,
    `Which documents are mandatory for ${serviceName}?`,
    `What is the step-by-step application procedure?`,
  ];

  return {
    status: 'success',
    grounded: true,
    confidenceScore: retrieval.confidenceScore,
    retrievedChunks: retrieval.retrievedChunks.map((c) => ({
      chunkId: c.chunkId,
      sectionType: c.sectionType,
      sectionTitle: c.sectionTitle,
      relevanceScore: c.relevanceScore,
      excerpt: c.content,
      sourceUrl: c.officialSource?.url,
      sourceName: c.officialSource?.name,
      lastVerified: c.lastVerified,
    })),
    data: {
      title: `${serviceName} (Verified Civic Guidance)`,
      summary: topChunk.content,
      detailedSummary: primarySummary,
      steps: service?.steps || [],
      documents: service?.documents || [],
      eligibility: service?.eligibility || [],
      fees: service?.fees || 'See official portal for latest schedule',
      processingTime: service?.processingTime || 'Subject to department review',
      officialSources: retrieval.sources,
      disclaimer: MANDATORY_LEGAL_DISCLAIMER,
      isGrounded: true,
      lastVerified: topChunk.lastVerified,
    },
    serviceId: topChunk.serviceId,
    suggestions,
  };
}
