/**
 * Source-Grounded Retriever (#77)
 * Implements BM25 relevance scoring and semantic keyword retrieval over ingested civic chunks.
 * Enforces a strict grounding threshold to prevent unsupported hallucinations.
 */

import { ragIndex, tokenizeText } from './ragIngestionService.js';

// Minimum confidence threshold required to consider an answer grounded in approved sources
export const MIN_CONFIDENCE_THRESHOLD = 0.28;

/**
 * Calculates BM25 score for a query against all indexed chunks.
 *
 * @param {string} query - Raw citizen search query
 * @param {Object} options - Search options
 * @param {number} options.topK - Number of top chunks to return (default: 3)
 * @param {number} options.minThreshold - Minimum threshold for grounding (default: MIN_CONFIDENCE_THRESHOLD)
 * @returns {Object} Retrieval results with confidence score and grounding status
 */
export function retrieveGroundedChunks(query, options = {}) {
  const topK = options.topK || 4;
  const threshold = options.minThreshold ?? MIN_CONFIDENCE_THRESHOLD;

  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) {
    return {
      grounded: false,
      confidenceScore: 0,
      reason: 'EMPTY_OR_UNPARSEABLE_QUERY',
      retrievedChunks: [],
      sources: [],
    };
  }

  ragIndex.refreshIfCatalogChanged();
  const chunks = ragIndex.getChunks();
  const totalDocs = ragIndex.totalDocs;
  const avgDocLength = ragIndex.avgDocLength;
  const k1 = ragIndex.k1;
  const b = ragIndex.b;

  const scores = new Map(); // chunkId -> bm25Score

  // Compute BM25 scores for each token
  for (const token of queryTokens) {
    const postings = ragIndex.invertedIndex.get(token) || [];
    const docFreq = postings.length;

    if (docFreq === 0) continue;

    // IDF calculation with smoothing
    const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));

    for (const posting of postings) {
      const docLen = ragIndex.docLengths.get(posting.chunkId) || avgDocLength;
      const tf = posting.tf;

      // BM25 term weighting
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / (avgDocLength || 1)));
      const termScore = idf * (numerator / denominator);

      scores.set(posting.chunkId, (scores.get(posting.chunkId) || 0) + termScore);
    }
  }

  // Exact phrase and title boost: ONLY applied if service matches or tokens overlap
  const lowerQuery = query.toLowerCase();
  for (const chunk of chunks) {
    const currentScore = scores.get(chunk.chunkId) || 0;
    const serviceNameLower = chunk.serviceName.toLowerCase();
    const serviceIdNormalized = (chunk.serviceId || '').replace(/-/g, ' ').toLowerCase();
    const isServiceMentioned =
      lowerQuery.includes(serviceNameLower) ||
      (serviceIdNormalized && lowerQuery.includes(serviceIdNormalized));

    // If query does not mention the service AND no tokens matched, skip boosting completely
    if (!isServiceMentioned && currentScore <= 0) {
      continue;
    }

    let boost = 0;

    // Strong boost if service name appears verbatim in user query
    if (isServiceMentioned) {
      boost += 4.5;
    }

    // Contextual section boost ONLY if service is mentioned OR has existing token relevance
    if (isServiceMentioned || currentScore > 0.5) {
      if (
        (lowerQuery.includes('document') || lowerQuery.includes('proof') || lowerQuery.includes('paper')) &&
        chunk.sectionType === 'documents'
      ) {
        boost += 2.5;
      }
      if (
        (lowerQuery.includes('fee') || lowerQuery.includes('cost') || lowerQuery.includes('charge')) &&
        chunk.sectionType === 'fees_timeline'
      ) {
        boost += 2.5;
      }
      if (
        (lowerQuery.includes('how to') || lowerQuery.includes('step') || lowerQuery.includes('apply') || lowerQuery.includes('process')) &&
        chunk.sectionType === 'procedure'
      ) {
        boost += 2.0;
      }
      if (
        (lowerQuery.includes('eligible') || lowerQuery.includes('who can') || lowerQuery.includes('age') || lowerQuery.includes('criteria')) &&
        chunk.sectionType === 'eligibility'
      ) {
        boost += 2.0;
      }
    }

    if (boost > 0) {
      scores.set(chunk.chunkId, currentScore + boost);
    }
  }

  // Sort candidate chunks by descending score
  const rankedChunkEntries = Array.from(scores.entries())
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (rankedChunkEntries.length === 0) {
    return {
      grounded: false,
      confidenceScore: 0,
      reason: 'NO_MATCHING_CIVIC_RECORDS',
      retrievedChunks: [],
      sources: [],
    };
  }

  // Calculate token coverage for the top candidate
  const topCandidateId = rankedChunkEntries[0][0];
  const topCandidate = ragIndex.getChunkById(topCandidateId);
  const topTokensSet = new Set(topCandidate ? topCandidate.tokens : []);
  const matchedTokensCount = queryTokens.filter((t) => topTokensSet.has(t)).length;
  const tokenCoverage = queryTokens.length > 0 ? matchedTokensCount / queryTokens.length : 0;

  const topServiceIdNorm = (topCandidate?.serviceId || '').replace(/-/g, ' ').toLowerCase();
  const isTopServiceExplicitlyMentioned =
    topCandidate &&
    (lowerQuery.includes(topCandidate.serviceName.toLowerCase()) ||
      (topServiceIdNorm && lowerQuery.includes(topServiceIdNorm)));

  // Normalize confidence score between 0.0 and 1.0
  const maxScore = rankedChunkEntries[0][1];
  const normalizedConfidence = Math.min(1.0, Number((maxScore / (maxScore + 3.0)).toFixed(2)));

  // Grounding requires confidence threshold AND either direct service mention or >= 40% token coverage
  const isGrounded =
    normalizedConfidence >= threshold &&
    (isTopServiceExplicitlyMentioned || tokenCoverage >= 0.4);

  // Retrieve top-k chunks
  const topChunks = rankedChunkEntries.slice(0, topK).map(([chunkId, rawScore]) => {
    const chunk = ragIndex.getChunkById(chunkId);
    return {
      ...chunk,
      relevanceScore: Number(rawScore.toFixed(2)),
    };
  });

  // Extract unique official sources
  const sourceMap = new Map();
  for (const chunk of topChunks) {
    if (chunk.officialSource && chunk.officialSource.url) {
      const key = chunk.officialSource.url;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          name: chunk.officialSource.name,
          url: chunk.officialSource.url,
          verified: !!chunk.officialSource.verified,
          department: chunk.department,
          serviceName: chunk.serviceName,
          lastVerified: chunk.lastVerified,
        });
      }
    }
  }

  return {
    grounded: isGrounded,
    confidenceScore: isGrounded
      ? normalizedConfidence
      : Math.min(0.12, Number((tokenCoverage * normalizedConfidence).toFixed(2))),
    reason: isGrounded ? 'VERIFIED_SOURCES_RETRIEVED' : 'LOW_CONFIDENCE_UNVERIFIED_QUERY',
    retrievedChunks: topChunks,
    sources: Array.from(sourceMap.values()),
    primaryServiceId: topChunks[0]?.serviceId || null,
  };
}
