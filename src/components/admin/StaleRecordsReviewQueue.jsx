import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  Layers,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import {
  getStaleReviewQueue,
  getCatalogFreshnessHealth,
  recordServiceReview,
} from '../../services/dataFreshnessTrustService';
import { getAllServices } from '../../services/serviceCatalog';

const StaleRecordsReviewQueue = () => {
  const [reviewQueue, setReviewQueue] = useState([]);
  const [health, setHealth] = useState(null);
  const [search, setSearch] = useState('');
  const [activeReviewModal, setActiveReviewModal] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewerName, setReviewerName] = useState('Admin Auditor');

  const refresh = () => {
    const active = getAllServices();
    const queue = getStaleReviewQueue(active);
    setReviewQueue(queue);
    setHealth(getCatalogFreshnessHealth(active));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleOpenReview = (item) => {
    setActiveReviewModal(item);
    setReviewNotes('');
  };

  const handleConfirmReview = (e) => {
    e.preventDefault();
    if (!activeReviewModal) return;

    try {
      recordServiceReview(activeReviewModal.serviceId, reviewerName, reviewNotes);
      setActiveReviewModal(null);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredQueue = reviewQueue.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.serviceName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.defects.some((d) => d.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid var(--border-light, rgba(255, 255, 255, 0.1))',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>
            Catalog Data Freshness & Stale Records Queue
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Transparent quality monitoring identifying services with missing fields, broken provenance, or aging review dates.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem', display: 'flex', gap: '0.35rem' }}
        >
          <RefreshCw size={14} /> Refresh Health
        </button>
      </div>

      {/* Catalog Health KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)' }}>
            {health ? health.averageScore : 0} / 100
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            Catalog Average Health
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#10b981' }}>
            {health ? health.highCount : 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            High Quality (85+)
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#38bdf8' }}>
            {health ? health.standardCount : 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            Standard Verified (60-84)
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ef4444' }}>
            {reviewQueue.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            In Review Queue
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50)',
              color: 'var(--text-tertiary)',
            }}
          />
          <input
            type="text"
            placeholder="Search queued services by name, category, or missing defect..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.25rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-main)',
              background: 'rgba(0, 0, 0, 0.2)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
            }}
          />
        </div>
      </div>

      {/* Stale Records Table / Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {filteredQueue.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#10b981' }}>
            <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>Review Queue Clear!</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              All catalog services currently satisfy source provenance and active freshness criteria.
            </div>
          </div>
        ) : (
          filteredQueue.map((item) => (
            <div
              key={item.serviceId}
              className="card"
              style={{
                padding: '1.25rem',
                borderRadius: '0.85rem',
                borderLeft: `4px solid ${item.score < 40 ? '#ef4444' : '#f59e0b'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '99px',
                        background: item.tier.bgLight,
                        color: item.tier.badgeColor,
                      }}
                    >
                      Score: {item.score} / 100
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-main)', fontWeight: '600' }}>
                      {item.category}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                    {item.serviceName}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a
                    href={`/services/${item.serviceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.775rem', display: 'flex', gap: '0.3rem' }}
                  >
                    <ExternalLink size={13} /> View Service
                  </a>

                  <button
                    type="button"
                    onClick={() => handleOpenReview(item)}
                    className="btn btn-primary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
                  >
                    Verify & Update Review
                  </button>
                </div>
              </div>

              {/* Exact Defects Lowering Confidence */}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f59e0b', marginBottom: '0.3rem' }}>
                  Defects Lowering Confidence Score:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {item.defects.map((defect, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '0.75rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.35rem',
                      }}
                    >
                      • {defect}
                    </span>
                  ))}
                </div>
              </div>

              {/* Last Review Cadence */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                <strong>Last Verified:</strong>{' '}
                {item.lastReviewedAt ? new Date(item.lastReviewedAt).toLocaleDateString() : 'Never formally verified'}{' '}
                {item.daysSinceReview !== null && `(${item.daysSinceReview} days ago)`}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Review Action Modal */}
      {activeReviewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-service-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '520px',
              width: '100%',
              borderRadius: '1rem',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 id="review-service-title" style={{ margin: 0, fontSize: '1.15rem' }}>
              Confirm Verification: {activeReviewModal.serviceName}
            </h3>

            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Marking this service verified will reset its freshness age to today, elevating its confidence score and clearing it from the stale records queue.
            </p>

            <form onSubmit={handleConfirmReview} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.35rem' }}>
                  Auditor Name / Review Cell
                </label>
                <input
                  type="text"
                  required
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-main)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.35rem' }}>
                  Verification Audit Notes
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Cross-checked with Parivahan portal; confirmed fee structure and documents are accurate as of 2026..."
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-main)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveReviewModal(null)}
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 1rem' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 1.25rem' }}>
                  Record Official Verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaleRecordsReviewQueue;
