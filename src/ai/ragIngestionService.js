/**
 * RAG Ingestion Service for Civic Assistant (#77)
 * Ingests approved civic service descriptions and FAQs into structured semantic chunks,
 * builds an inverted BM25 + TF-IDF index, and preserves source metadata for verifiable citations.
 */

import { getActiveBuiltInServices } from '../services/serviceCatalog.js';
import { FAQ_DATABASE } from '../data/faq_database.js';

// English stop words for accurate token filtering
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
  // Civic domain stop words that appear ubiquitously across all documents
  'government', 'portal', 'department', 'services', 'service', 'india'
]);

/**
 * Tokenizes text, lowercases, strips punctuation, and filters out stop words.
 * @param {string} text
 * @returns {string[]} List of meaningful tokens
 */
export function tokenizeText(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Chunks a single service into searchable sections while preserving source metadata.
 * @param {Object} service - Service object from services.js
 * @returns {Object[]} Chunks with source metadata
 */
export function chunkService(service) {
  const chunks = [];
  const primarySource = service.officialSources?.[0] || {
    name: 'National Government Services Portal',
    url: 'https://services.india.gov.in',
    verified: true,
  };

  const baseMeta = {
    serviceId: service.id,
    serviceName: service.name,
    category: service.category || 'General',
    department: service.department || 'Government of India',
    officialSource: primarySource,
    lastVerified: service.lastVerified || '2024-01-01',
  };

  // Chunk 1: Overview & Purpose
  chunks.push({
    chunkId: `${service.id}-overview`,
    sectionType: 'overview',
    sectionTitle: `${service.name} Overview & Purpose`,
    content: `${service.name}: ${service.shortDescription}. Category: ${service.category}. Department: ${service.department}. Estimated processing time: ${service.processingTime}. Fees: ${service.fees}.`,
    tokens: tokenizeText(`${service.name} ${service.shortDescription} ${service.category} ${service.department}`),
    ...baseMeta,
  });

  // Chunk 2: Eligibility Criteria
  if (service.eligibility && service.eligibility.length > 0) {
    const elText = service.eligibility.join('. ');
    chunks.push({
      chunkId: `${service.id}-eligibility`,
      sectionType: 'eligibility',
      sectionTitle: `Eligibility Criteria for ${service.name}`,
      content: `Who can apply for ${service.name}: ${elText}`,
      tokens: tokenizeText(`${service.name} eligibility apply who can ${elText}`),
      ...baseMeta,
    });
  }

  // Chunk 3: Required Documents
  if (service.documents && service.documents.length > 0) {
    const docsText = service.documents.join(', ');
    chunks.push({
      chunkId: `${service.id}-documents`,
      sectionType: 'documents',
      sectionTitle: `Mandatory Documents for ${service.name}`,
      content: `Required official documents for ${service.name}: ${docsText}`,
      tokens: tokenizeText(`${service.name} documents required proofs paper certificates ${docsText}`),
      ...baseMeta,
    });
  }

  // Chunk 4: Application Procedure & Steps
  if (service.steps && service.steps.length > 0) {
    const stepsText = service.steps
      .map((step, idx) => `Step ${idx + 1}: ${step.title} - ${step.description}`)
      .join('. ');
    chunks.push({
      chunkId: `${service.id}-procedure`,
      sectionType: 'procedure',
      sectionTitle: `Application Steps for ${service.name}`,
      content: `Procedure to apply for ${service.name}: ${stepsText}`,
      tokens: tokenizeText(`${service.name} apply steps procedure how to process ${stepsText}`),
      ...baseMeta,
    });
  }

  // Chunk 5: Official Fees & Timeline
  chunks.push({
    chunkId: `${service.id}-fees-timeline`,
    sectionType: 'fees_timeline',
    sectionTitle: `Official Fees & Timeline for ${service.name}`,
    content: `Official Government Fees for ${service.name}: ${service.fees}. Processing duration: ${service.processingTime}. Fee type: ${service.feeType || 'standard'}.`,
    tokens: tokenizeText(`${service.name} fees cost charge payment processing duration time days ${service.fees} ${service.processingTime}`),
    ...baseMeta,
  });

  // Chunk 6: Warnings & Special Rules
  if (service.warnings && service.warnings.length > 0) {
    const warnText = service.warnings.join('. ');
    chunks.push({
      chunkId: `${service.id}-warnings`,
      sectionType: 'warnings',
      sectionTitle: `Important Warnings & Guidelines for ${service.name}`,
      content: `Crucial guidelines for ${service.name}: ${warnText}`,
      tokens: tokenizeText(`${service.name} warning note caution rules delay penalty ${warnText}`),
      ...baseMeta,
    });
  }

  return chunks;
}

/**
 * Chunks a FAQ entry into a searchable chunk.
 * @param {Object} faq
 * @returns {Object}
 */
export function chunkFaq(faq, index = 0) {
  const identifier = faq.id || `item-${index}`;
  return {
    chunkId: `faq-${identifier}`,
    sectionType: 'faq',
    sectionTitle: faq.title,
    content: `${faq.title}: ${faq.summary}`,
    tokens: tokenizeText(`${faq.title} ${faq.summary} ${(faq.keywords || []).join(' ')}`),
    serviceId: faq.serviceId || null,
    serviceName: faq.title,
    category: 'FAQ',
    department: 'Civic Help Desk',
    officialSource: {
      name: 'Official FAQ & Directives',
      url: 'https://services.india.gov.in',
      verified: true,
    },
    lastVerified: '2024-01-01',
  };
}

/**
 * In-memory RAG Index containing chunk repository and inverted index.
 */
class RagKnowledgeIndex {
  constructor() {
    this.chunks = [];
    this.invertedIndex = new Map(); // term -> array of { chunkId, termFrequency }
    this.docLengths = new Map(); // chunkId -> tokenCount
    this.avgDocLength = 0;
    this.totalDocs = 0;
    this.indexedAt = null;
    this.k1 = 1.2; // BM25 tuning parameter
    this.b = 0.75; // BM25 tuning parameter
  }

  /**
   * Builds the inverted index from given service and FAQ data.
   * @param {Object[]} services
   * @param {Object[]} faqs
   */
  buildIndex(services, faqs = FAQ_DATABASE) {
    // Default catalog: active built-in guides only. Remember which ones so a
    // later archive/restore can be noticed (see refreshIfCatalogChanged).
    this.followsCatalog = services === undefined;
    if (this.followsCatalog) services = getActiveBuiltInServices();
    this.catalogSignature = services.map((s) => s.id).join('|');
    const allChunks = [];

    // Ingest services
    for (const service of services) {
      const serviceChunks = chunkService(service);
      allChunks.push(...serviceChunks);
    }

    // Ingest FAQs
    for (let i = 0; i < faqs.length; i++) {
      allChunks.push(chunkFaq(faqs[i], i));
    }

    this.chunks = allChunks;
    this.totalDocs = allChunks.length;
    this.invertedIndex.clear();
    this.docLengths.clear();

    let totalLength = 0;

    for (const chunk of allChunks) {
      const tokens = chunk.tokens;
      const docLength = tokens.length;
      this.docLengths.set(chunk.chunkId, docLength);
      totalLength += docLength;

      // Count term frequencies within this chunk
      const tfMap = new Map();
      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }

      for (const [token, count] of tfMap.entries()) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, []);
        }
        this.invertedIndex.get(token).push({
          chunkId: chunk.chunkId,
          tf: count,
        });
      }
    }

    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
    this.indexedAt = new Date().toISOString();

    return {
      totalDocs: this.totalDocs,
      uniqueTerms: this.invertedIndex.size,
      indexedAt: this.indexedAt,
    };
  }

  /**
   * Rebuilds the index when it was built from the default catalog and a guide
   * has since been archived or restored, so retired guides stop being quoted
   * without a page reload. Indexes built from explicit data are left alone.
   */
  refreshIfCatalogChanged() {
    if (!this.followsCatalog) return;
    const signature = getActiveBuiltInServices().map((s) => s.id).join('|');
    if (signature !== this.catalogSignature) this.buildIndex();
  }

  /**
   * Retrieves all registered chunks.
   * @returns {Object[]}
   */
  getChunks() {
    return this.chunks;
  }

  /**
   * Finds a chunk by its unique ID.
   * @param {string} chunkId
   * @returns {Object | undefined}
   */
  getChunkById(chunkId) {
    return this.chunks.find((c) => c.chunkId === chunkId);
  }

  /**
   * Returns metadata and stats about the current index state.
   */
  getStats() {
    return {
      totalChunks: this.chunks.length,
      uniqueTerms: this.invertedIndex.size,
      avgDocLength: Math.round(this.avgDocLength),
      lastIndexed: this.indexedAt,
    };
  }
}

// Singleton global instance
export const ragIndex = new RagKnowledgeIndex();

// Auto-initialize index on module load
ragIndex.buildIndex();
