import { useState, useEffect } from 'react';
import {
  CheckSquare,
  AlertTriangle,
  MessageSquare,
  Users,
  LogOut,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Shield,
  FileCheck,
  History,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getAdminServices,
  saveAdminService,
  deleteAdminService,
  hasLocalServiceCopy,
  archiveAdminServices,
  restoreAdminServices,
  getReports,
  resolveReport,
  dismissReport,
  getAuditLogs,
  getUserList,
  updateUserRole,
  getServiceSubmissions,
  approveServiceSubmission,
  rejectServiceSubmission,
} from '../services/adminService';
import AdminStatsGrid from '../components/admin/AdminStatsGrid';
import ServiceModal from '../components/admin/ServiceModal';
import ReportResolutionModal from '../components/admin/ReportResolutionModal';
import RoleManagementModal from '../components/admin/RoleManagementModal';
import ServiceSubmissionReviewModal from '../components/admin/ServiceSubmissionReviewModal';
import AuditLogViewer from '../components/admin/AuditLogViewer';
import ServiceImportPanel from '../components/admin/ServiceImportPanel';
import ServiceRecordList from '../components/admin/ServiceRecordList';
import ServiceLifecycleReview from '../components/admin/ServiceLifecycleReview';
import { isArchived, planBulkArchive, planBulkRestore } from '../services/serviceLifecycle';
import ServiceOwnershipModal from '../components/admin/ServiceOwnershipModal';
import {
  getOwnershipMap,
  assignServiceOwnership,
  clearServiceOwnership,
  filterByOwnership,
  buildOwnershipFilterOptions,
} from '../services/serviceOwnershipService';
import StaleRecordsReviewQueue from '../components/admin/StaleRecordsReviewQueue';
import BottleneckFeedbackDashboard from '../components/admin/BottleneckFeedbackDashboard';
import NoticeManagementPanel from '../components/admin/NoticeManagementPanel';
import AvailabilityNoticePanel from '../components/admin/AvailabilityNoticePanel';
import { useToast } from '../context/ToastContext';
import { getAuditReports, resolveAuditReport } from '../services/communityAuditService';
import { describeAuditReport, countOpenAudits } from '../utils/auditReportView';
import ConfirmationDialog from '../components/common/ConfirmationDialog';
import { MOCK_SERVICES } from '../data/services';
import {
  createActionGuard,
  buildServiceRemovalDialog,
  buildReportDismissalDialog,
  removeServiceGuide,
  dismissReportEntry,
  describeActionFailure,
} from '../utils/adminDestructiveActions';
import SourceConflictReviewQueue from '../components/admin/SourceConflictReviewQueue';
import BarrierInsightsDashboard from '../components/barriers/BarrierInsightsDashboard';
import RuleConflictInspectorModal from '../components/admin/RuleConflictInspectorModal';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [services, setServices] = useState([]);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [communityAudits, setCommunityAudits] = useState([]);

  // Modals
  const [serviceModal, setServiceModal] = useState({
    isOpen: false,
    service: null,
  });
  const [reportModal, setReportModal] = useState({
    isOpen: false,
    report: null,
  });
  const [roleModal, setRoleModal] = useState({
    isOpen: false,
    targetUser: null,
  });
  const [submissionModal, setSubmissionModal] = useState({
    isOpen: false,
    submission: null,
  });
  const [importOpen, setImportOpen] = useState(false);

  // Catalog lifecycle states
  const [catalogView, setCatalogView] = useState('active');
  const [selectedIds, setSelectedIds] = useState([]);
  const [lifecycleReview, setLifecycleReview] = useState(null);
  const [isLifecycleRunning, setIsLifecycleRunning] = useState(false);

  // Ownership & Filtering states
  const [ownership, setOwnership] = useState({});
  const [ownershipFilter, setOwnershipFilter] = useState('all');
  const [ownershipModal, setOwnershipModal] = useState({ isOpen: false, service: null });

  const [isRuleConflictModalOpen, setIsRuleConflictModalOpen] = useState(false);

  // Destructive action waiting for confirmation
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionGuard] = useState(createActionGuard);

  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setServices(getAdminServices());
    setReports(getReports());
    setUsers(getUserList());
    setAuditLogs(getAuditLogs());
    setSubmissions(getServiceSubmissions());
    setCommunityAudits(getAuditReports());
    setOwnership(getOwnershipMap());
  }, []);

  const handleAssignOwnership = (serviceId, input) => {
    const result = assignServiceOwnership(serviceId, input, {
      users,
      actorName: user?.username || 'SuperAdmin',
    });
    if (result.ok) {
      setOwnership(getOwnershipMap());
      setAuditLogs(getAuditLogs());
      toast?.success?.('Review assignment saved. The public guide is unchanged.');
    }
    return result;
  };

  const handleClearOwnership = (serviceId) => {
    clearServiceOwnership(serviceId, { actorName: user?.username || 'SuperAdmin' });
    setOwnership(getOwnershipMap());
    setAuditLogs(getAuditLogs());
    toast?.success?.('Review assignment cleared.');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveService = (serviceData) => {
    const updated = saveAdminService(
      serviceData,
      user?.username || 'SuperAdmin'
    );
    setServices(updated);
    setAuditLogs(getAuditLogs());
    toast?.success?.(
      'Service guide saved. It now shows in the public directory on this device.'
    );
  };

  const handleImportResult = (result) => {
    if (!result.ok) {
      toast?.error?.(result.error);
      return;
    }

    setServices(getAdminServices());
    setAuditLogs(getAuditLogs());

    const skipped = result.skipped.length
      ? ` ${result.skipped.length} skipped because they were added elsewhere in the meantime.`
      : '';

    if (result.imported) {
      toast?.success?.(
        `${result.imported} service${result.imported === 1 ? '' : 's'} imported.${skipped}`
      );
    } else {
      toast?.warning?.(`Nothing was imported.${skipped}`);
    }
  };

  const activeServices = services.filter((svc) => !isArchived(svc));
  const archivedServices = services.filter(isArchived);
  
  // Combine catalog view and ownership filter logic safely
  const currentCatalogBase = catalogView === 'archived' ? archivedServices : activeServices;
  const shownServices = filterByOwnership(currentCatalogBase, ownership, users, ownershipFilter);

  const changeCatalogView = (view) => {
    setCatalogView(view);
    setSelectedIds([]);
    setLifecycleReview(null);
  };

  const toggleSelected = (id) => {
    setLifecycleReview(null);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAllSelected = (checked) => {
    setLifecycleReview(null);
    setSelectedIds(checked ? shownServices.map((svc) => svc.id) : []);
  };

  const reviewLifecycle = () => {
    const kind = catalogView === 'archived' ? 'restore' : 'archive';
    const plan = (kind === 'archive' ? planBulkArchive : planBulkRestore)(selectedIds, services);
    setLifecycleReview({ kind, plan });
  };

  const applyLifecycle = () => {
    if (!lifecycleReview || isLifecycleRunning) return;
    const { kind } = lifecycleReview;
    setIsLifecycleRunning(true);
    try {
      const actor = user?.username || 'SuperAdmin';
      const result = (kind === 'archive' ? archiveAdminServices : restoreAdminServices)(selectedIds, actor);
      setServices(result.services);
      setAuditLogs(getAuditLogs());
      if (!result.ok) {
        toast?.error?.(result.error);
        return;
      }
      const word = kind === 'archive' ? 'archived' : 'restored';
      if (result.changed) {
        const left = result.plan.invalid.length + result.plan.unknownIds.length;
        toast?.success?.(
          `${result.changed} service guide${result.changed === 1 ? '' : 's'} ${word}.${left ? ` ${left} skipped, see the audit log.` : ''}`
        );
      } else {
        toast?.warning?.(`Nothing was ${word}.`);
      }
      setSelectedIds([]);
      setLifecycleReview(null);
    } catch {
      toast?.error?.('That change was not allowed or could not be saved.');
    } finally {
      setIsLifecycleRunning(false);
    }
  };

  const handleDeleteService = (id) => {
    const target = services.find((service) => service.id === id);
    if (!target) return;

    const builtIn = MOCK_SERVICES.some((service) => service.id === id);

    setActionError('');
    setPendingAction({
      kind: 'service',
      id,
      name: target.name,
      builtIn,
      dialog: buildServiceRemovalDialog(target, { builtIn }),
    });
  };

  const handleCancelPendingAction = () => {
    if (actionGuard.isPending()) return;

    setPendingAction(null);
    setActionError('');
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;

    const actor = user?.username || 'SuperAdmin';

    const result = await actionGuard.run(async () => {
      setIsActionRunning(true);
      setActionError('');

      if (pendingAction.kind === 'report') {
        return {
          reports: dismissReportEntry({
            id: pendingAction.id,
            dismissReport,
          }),
        };
      }

      return removeServiceGuide({
        id: pendingAction.id,
        name: pendingAction.name,
        builtIn: pendingAction.builtIn,
        actor,
        deleteService: deleteAdminService,
        hadLocalChanges: hasLocalServiceCopy(pendingAction.id),
      });
    });

    setIsActionRunning(false);

    if (result.status === 'busy') return;

    if (result.status === 'failed') {
      setActionError(
        describeActionFailure(pendingAction.kind, pendingAction.name)
      );

      toast?.error?.(
        pendingAction.kind === 'report'
          ? 'Report was not dismissed.'
          : `"${pendingAction.name}" was not changed.`
      );
      return;
    }

    if (pendingAction.kind === 'report') {
      setReports(result.value.reports);
      toast?.success?.(
        'Report dismissed. It was deleted from the queue and cannot be restored.'
      );
    } else {
      setServices(result.value.services);
      setAuditLogs(getAuditLogs());

      const { outcome } = result.value;

      if (outcome === 'nothing-to-clear') {
        toast?.info?.(
          `"${pendingAction.name}" has no local changes saved on this device. The built-in guide stays in the directory.`
        );
      } else {
        toast?.success?.(
          outcome === 'reverted-to-builtin'
            ? `Local changes to "${pendingAction.name}" cleared. The built-in guide stays in the directory.`
            : `"${pendingAction.name}" removed from the directory. This cannot be undone from here.`
        );
      }
    }

    setPendingAction(null);
  };

  const handleResolveReport = (id, resolution) => {
    const updated = resolveReport(
      id,
      resolution,
      user?.username || 'SuperAdmin'
    );
    setReports(updated);
    setAuditLogs(getAuditLogs());
  };

  const handleDismissReport = (id) => {
    const target = reports.find((report) => report.id === id);
    if (!target) return;

    setActionError('');
    setPendingAction({
      kind: 'report',
      id,
      name: target.serviceName,
      dialog: buildReportDismissalDialog(target),
    });
  };

  const handleEditServiceFromReport = (serviceId) => {
    const target = services.find((service) => service.id === serviceId);

    if (target) {
      setServiceModal({
        isOpen: true,
        service: target,
      });
    }
  };

  const handleSaveRole = (userId, newRole, customPermissions) => {
    const updated = updateUserRole(
      userId,
      newRole,
      customPermissions,
      user?.username || 'SuperAdmin'
    );
    setUsers(updated);
    setAuditLogs(getAuditLogs());
  };

  const handleApproveSubmission = (submissionId, reviewNotes) => {
    const updated = approveServiceSubmission(
      submissionId,
      reviewNotes,
      user?.username || 'SuperAdmin'
    );
    setSubmissions(updated);
    setServices(getAdminServices());
    setAuditLogs(getAuditLogs());
  };

  const handleRejectSubmission = (submissionId, reviewNotes) => {
    const updated = rejectServiceSubmission(
      submissionId,
      reviewNotes,
      user?.username || 'SuperAdmin'
    );
    setSubmissions(updated);
    setAuditLogs(getAuditLogs());
  };

  const handleResolveAudit = (auditId) => {
    const note = window.prompt(
      'Enter administrative resolution note / corrective action taken:',
      'Verified ground reality and updated office procedure.'
    );

    if (note && note.trim()) {
      resolveAuditReport(
        auditId,
        note.trim(),
        user?.username || 'SuperAdmin'
      );
      setCommunityAudits(getAuditReports());
      toast?.success?.(
        'Discrepancy audit resolved and official notice published.'
      );
    }
  };

  const pendingReportsCount = reports.filter(
    (report) => report.status === 'pending'
  ).length;

  const pendingSubmissionsCount = submissions.filter(
    (submission) => submission.status === 'pending'
  ).length;

  const pendingAuditsCount = countOpenAudits(communityAudits);
  
  return (
    <div
      className="section animate-fade-in"
      style={{ paddingBottom: '6rem' }}
    >
      <div className="container" style={{ maxWidth: '1280px' }}>
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            paddingBottom: '1.25rem',
            borderBottom: '1px solid var(--border-main)',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: 'var(--accent-main)',
                fontSize: '0.85rem',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '0.25rem',
              }}
            >
              <ShieldCheck size={18} /> Governance & Content Moderation Portal
            </div>

            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 2.75rem)',
                fontWeight: '900',
              }}
            >
              Civic Administration Dashboard
            </h1>

            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.95rem',
                marginTop: '0.2rem',
              }}
            >
              Review service submissions, manage public guides, resolve citizen
              reports, and administer RBAC roles.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  display: 'block',
                }}
              >
                {user?.fullName || user?.username || 'Admin User'}
              </span>

              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '99px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: 'var(--accent-main)',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                }}
              >
                Role: {user?.role || 'admin'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{
                padding: '0.5rem 0.85rem',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {/* Layout Grid */}
        <div
          className="admin-layout"
          style={{
            display: 'grid',
            gap: '2rem',
            alignItems: 'start',
          }}
        >
          {/* Sidebar Tabs */}
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              padding: '0.75rem',
              borderRadius: '0.85rem',
            }}
          >
            {[
              { id: 'dashboard', label: 'Overview Metrics', badge: null },
              {
                id: 'services',
                label: `Service Catalog (${activeServices.length})`,
                badge: null,
              },
              {
                id: 'submissions',
                label: 'Submissions Queue',
                badge: pendingSubmissionsCount || null,
              },
              {
                id: 'reports',
                label: 'Inaccuracy Reports',
                badge: pendingReportsCount || null,
              },
              {
                id: 'community-audits',
                label: 'Discrepancy Audits',
                badge: pendingAuditsCount || null,
              },
              {
                id: 'freshness',
                label: 'Freshness & Trust Queue',
                badge: null,
              },
              {
                id: 'bottlenecks',
                label: 'Process Bottleneck Loop',
                badge: null,
              },
              {
                id: 'notices',
                label: 'Notices & Gazette Digest',
                badge: null,
              },
              {
                id: 'users',
                label: `User Roles (${users.length})`,
                badge: null,
              },
              { id: 'audit', label: 'Audit Trail Logs', badge: null },
            ].map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '0.55rem',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: 'none',
                    transition: 'all 0.15s',
                    background: isActive
                      ? 'var(--accent-main)'
                      : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  <span>{tab.label}</span>

                  {tab.badge && (
                    <span
                      style={{
                        padding: '0.1rem 0.45rem',
                        borderRadius: '99px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        background: isActive
                          ? '#ffffff'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: isActive
                          ? 'var(--accent-main)'
                          : '#ef4444',
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Content Area */}
          <div>
            {/* Overview Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div>
                <AdminStatsGrid
                  servicesCount={services.length}
                  reportsCount={pendingReportsCount}
                />

                {/* Civic Source Conflict and Confidence Review Queue (#149) */}
                <SourceConflictReviewQueue />

                {/* Citizen-Reported Service Barrier Insights Dashboard (#148) */}
                <BarrierInsightsDashboard />
              </div>
            )}

            {/* Service Catalog Tab */}
            {activeTab === 'services' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      margin: 0,
                    }}
                  >
                    Public Service Guides
                  </h2>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setImportOpen((open) => !open)}
                      className="btn btn-secondary"
                      aria-expanded={importOpen}
                      style={{
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <Upload size={16} /> Import CSV / JSON
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setServiceModal({ isOpen: true, service: null })
                      }
                      className="btn btn-primary"
                      style={{
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <Plus size={16} /> Add New Service Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRuleConflictModalOpen(true)}
                      className="btn btn-outline"
                      style={{
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <AlertTriangle size={16} color="#f59e0b" /> Rule Conflict Inspector
                    </button>
                  </div>
                </div>

                {importOpen && (
                  <ServiceImportPanel
                    existingServices={services}
                    actorName={user?.username || 'SuperAdmin'}
                    onImported={handleImportResult}
                    onClose={() => setImportOpen(false)}
                  />
                )}

                {/* Combined Lifecycle Controls & Ownership Filter Bar */}
                <div className="lifecycle-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="lifecycle-bar__views" role="group" aria-label="Catalog view">
                    <button
                      type="button"
                      className={`btn ${catalogView === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                      aria-pressed={catalogView === 'active'}
                      onClick={() => changeCatalogView('active')}
                    >
                      Active ({activeServices.length})
                    </button>
                    <button
                      type="button"
                      className={`btn ${catalogView === 'archived' ? 'btn-primary' : 'btn-secondary'}`}
                      aria-pressed={catalogView === 'archived'}
                      onClick={() => changeCatalogView('archived')}
                    >
                      Archived ({archivedServices.length})
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div className="ownership-filter" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label htmlFor="ownership-filter" style={{ fontSize: '0.85rem', fontWeight: '600' }}>Filter:</label>
                      <select
                        id="ownership-filter"
                        className="input-field"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={ownershipFilter}
                        onChange={(e) => setOwnershipFilter(e.target.value)}
                      >
                        {buildOwnershipFilterOptions(ownership, users).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={selectedIds.length === 0}
                      onClick={reviewLifecycle}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {catalogView === 'archived' ? 'Restore' : 'Archive'} selected ({selectedIds.length})
                    </button>
                  </div>
                </div>

                {lifecycleReview && (
                  <ServiceLifecycleReview
                    kind={lifecycleReview.kind}
                    plan={lifecycleReview.plan}
                    busy={isLifecycleRunning}
                    onConfirm={applyLifecycle}
                    onCancel={() => setLifecycleReview(null)}
                  />
                )}

                {shownServices.length === 0 ? (
                  <p className="lifecycle-empty" role="status">
                    {catalogView === 'archived'
                      ? 'No archived service guides matching filter. Archive a retired guide from the Active list.'
                      : 'No active service guides matching filter.'}
                  </p>
                ) : (
                  <ServiceRecordList
                    services={shownServices}
                    ownership={ownership}
                    users={users}
                    onAssign={(service) => setOwnershipModal({ isOpen: true, service })}
                    onEdit={(service) =>
                      setServiceModal({ isOpen: true, service })
                    }
                    onDelete={catalogView === 'archived' ? undefined : handleDeleteService}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelected}
                    onToggleAll={toggleAllSelected}
                  />
                )}

                <ServiceOwnershipModal
                  isOpen={ownershipModal.isOpen}
                  onClose={() => setOwnershipModal({ isOpen: false, service: null })}
                  service={ownershipModal.service}
                  current={ownershipModal.service ? ownership[ownershipModal.service.id] : null}
                  users={users}
                  onSave={handleAssignOwnership}
                  onClear={handleClearOwnership}
                />

                <RuleConflictInspectorModal
                  isOpen={isRuleConflictModalOpen}
                  onClose={() => setIsRuleConflictModalOpen(false)}
                  services={services.filter((s) => s.archived !== true)}
                />
              </div>
            )}

            {/* Community Submissions Queue Tab */}
            {activeTab === 'submissions' && (
              <div>
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderBottom: '1px solid var(--border-light)',
                    paddingBottom: '0.75rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      margin: 0,
                    }}
                  >
                    Community Submissions & Edits Queue
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      margin: '0.25rem 0 0',
                    }}
                  >
                    Citizen and contributor proposals pending moderator
                    verification before publication.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  {submissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="glass-panel"
                      style={{
                        padding: '1.25rem',
                        borderRadius: '0.85rem',
                        borderLeft: `4px solid ${
                          sub.status === 'approved'
                            ? '#10b981'
                            : sub.status === 'rejected'
                              ? '#ef4444'
                              : '#f59e0b'
                        }`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              color: 'var(--accent-main)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {sub.category}
                          </span>

                          <h3
                            style={{
                              fontSize: '1.15rem',
                              fontWeight: '800',
                              margin: '0.2rem 0',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {sub.name}
                          </h3>

                          <span
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-tertiary)',
                            }}
                          >
                            Submitted by: {sub.submittedBy} (
                            {sub.contributorEmail}) on {sub.submittedAt}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '99px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            background:
                              sub.status === 'approved'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                            color:
                              sub.status === 'approved'
                                ? '#10b981'
                                : '#f59e0b',
                          }}
                        >
                          {sub.status}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary)',
                          margin: '0.5rem 0 1rem',
                        }}
                      >
                        {sub.shortDescription}
                      </p>

                      {sub.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setSubmissionModal({
                                isOpen: true,
                                submission: sub,
                              })
                            }
                            className="btn btn-primary"
                            style={{
                              padding: '0.45rem 1rem',
                              fontSize: '0.85rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                            }}
                          >
                            <FileCheck size={15} /> Review & Moderate
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reports Queue Tab */}
            {activeTab === 'reports' && (
              <div>
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderBottom: '1px solid var(--border-light)',
                    paddingBottom: '0.75rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      margin: 0,
                    }}
                  >
                    Community Inaccuracy Reports
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      margin: '0.25rem 0 0',
                    }}
                  >
                    Citizens flag broken links, outdated fees, and missing
                    procedures for moderator audit.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="card"
                      style={{
                        padding: '1.25rem',
                        borderLeft: `4px solid ${
                          report.status === 'resolved' ? '#10b981' : '#f59e0b'
                        }`,
                        background: 'var(--glass-bg)',
                      }}
                    >
                      <div
                        className="flex-between"
                        style={{
                          marginBottom: '0.4rem',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              color: 'var(--accent-main)',
                              textTransform: 'uppercase',
                              marginRight: '0.5rem',
                            }}
                          >
                            {report.serviceName}
                          </span>

                          <strong
                            style={{
                              color: 'var(--text-primary)',
                              fontSize: '0.95rem',
                            }}
                          >
                            {report.issueType}
                          </strong>
                        </div>

                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {report.createdAt}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary)',
                          marginBottom: '0.85rem',
                          fontStyle: 'italic',
                        }}
                      >
                        "{report.description}"
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        {report.status === 'resolved' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.8rem',
                              color: '#10b981',
                              fontWeight: '600',
                            }}
                          >
                            <CheckCircle2 size={16} /> Resolved:{' '}
                            {report.resolutionNotes}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setReportModal({ isOpen: true, report })
                              }
                              className="btn btn-primary"
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                              }}
                            >
                              Review & Resolve
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDismissReport(report.id)}
                              className="btn btn-secondary"
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                              }}
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Community Discrepancy Audits Tab */}
            {activeTab === 'community-audits' && (
              <div>
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderBottom: '1px solid var(--border-light)',
                    paddingBottom: '0.75rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      margin: 0,
                    }}
                  >
                    Crowdsourced Discrepancy Audits
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      margin: '0.25rem 0 0',
                    }}
                  >
                    Citizen-reported divergences between official service rules
                    and ground-level counter demands.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  {communityAudits.length === 0 ? (
                    <div
                      className="card"
                      style={{
                        padding: '2rem',
                        textAlign: 'center',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      No community discrepancy reports recorded yet.
                    </div>
                  ) : (
                    communityAudits
                      .map((report) => describeAuditReport(report, services))
                      .map((item) => (
                        <div
                          key={item.id}
                          className="card"
                          style={{
                            padding: '1.25rem',
                            borderLeft: `4px solid ${
                              item.tone === 'resolved'
                                ? '#10b981'
                                : item.tone === 'urgent'
                                  ? '#ef4444'
                                  : '#f59e0b'
                            }`,
                            background: 'var(--glass-bg)',
                          }}
                        >
                          <div
                            className="flex-between"
                            style={{
                              marginBottom: '0.4rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  color: 'var(--accent-main)',
                                  textTransform: 'uppercase',
                                  marginRight: '0.5rem',
                                }}
                              >
                                {item.serviceName}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  fontWeight: '600',
                                }}
                              >
                                {item.categoryLabel}
                              </span>
                            </div>

                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-tertiary)',
                              }}
                            >
                              {item.reportedDate}
                            </span>
                          </div>

                          <h4
                            style={{
                              fontSize: '1rem',
                              fontWeight: '700',
                              color: 'var(--text-primary)',
                              margin: '0.3rem 0',
                            }}
                          >
                            {item.title}
                          </h4>

                          <p
                            style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-secondary)',
                              marginBottom: '0.6rem',
                            }}
                          >
                            {item.description}
                          </p>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                              paddingTop: '0.5rem',
                              borderTop: '1px solid var(--border-light)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '1rem',
                                fontSize: '0.8rem',
                                color: 'var(--text-tertiary)',
                              }}
                            >
                              <span>
                                👍 {item.upvotes} Citizens Corroborated
                              </span>
                              <span>👎 {item.downvotes} Refuted</span>
                              <span>Reported by: {item.reportedBy}</span>
                            </div>

                            {item.resolved ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.8rem',
                                  color: '#10b981',
                                  fontWeight: '600',
                                }}
                              >
                                <CheckCircle2 size={16} /> Resolved:{' '}
                                {item.adminNote}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleResolveAudit(item.id)}
                                className="btn btn-primary"
                                style={{
                                  padding: '0.4rem 0.85rem',
                                  fontSize: '0.8rem',
                                }}
                              >
                                Resolve & Post Directive
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* User Roles & RBAC Governance Tab */}
            {activeTab === 'users' && (
              <div>
                <div
                  style={{
                    marginBottom: '1.25rem',
                    borderBottom: '1px solid var(--border-light)',
                    paddingBottom: '0.75rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      margin: 0,
                    }}
                  >
                    User Roles & Governance Access Control
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      margin: '0.25rem 0 0',
                    }}
                  >
                    Assign administrative privileges, moderator queue access,
                    or editor permissions.
                  </p>
                </div>

                <div
                  className="glass-panel"
                  style={{
                    borderRadius: '0.85rem',
                    overflow: 'hidden',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      borderCollapse: 'collapse',
                      fontSize: '0.875rem',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          color: 'var(--text-tertiary)',
                          background: 'rgba(0, 0, 0, 0.15)',
                        }}
                      >
                        <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>
                          Citizen / Officer
                        </th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>
                          Email Address
                        </th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>
                          Active Role
                        </th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>
                          Member Since
                        </th>
                        <th
                          style={{
                            padding: '0.85rem 1rem',
                            fontWeight: '700',
                            textAlign: 'right',
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {users.map((usr) => (
                        <tr
                          key={usr.id}
                          style={{ borderBottom: '1px solid var(--border-light)' }}
                        >
                          <td
                            style={{
                              padding: '0.85rem 1rem',
                              fontWeight: '600',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {usr.username}
                          </td>

                          <td
                            style={{
                              padding: '0.85rem 1rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {usr.email}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '99px',
                                textTransform: 'uppercase',
                                fontWeight: '700',
                                background:
                                  usr.role === 'admin'
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : usr.role === 'moderator'
                                      ? 'rgba(245, 158, 11, 0.15)'
                                      : usr.role === 'editor'
                                        ? 'rgba(56, 189, 248, 0.15)'
                                        : 'rgba(255, 255, 255, 0.08)',
                                color:
                                  usr.role === 'admin'
                                    ? '#ef4444'
                                    : usr.role === 'moderator'
                                      ? '#f59e0b'
                                      : usr.role === 'editor'
                                        ? 'var(--accent-main)'
                                        : 'var(--text-secondary)',
                              }}
                            >
                              {usr.role}
                            </span>
                          </td>

                          <td
                            style={{
                              padding: '0.85rem 1rem',
                              color: 'var(--text-tertiary)',
                            }}
                          >
                            {usr.joinedAt}
                          </td>

                          <td
                            style={{
                              padding: '0.85rem 1rem',
                              textAlign: 'right',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setRoleModal({
                                  isOpen: true,
                                  targetUser: usr,
                                })
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-main)',
                                fontWeight: '600',
                                cursor: 'pointer',
                              }}
                            >
                              Edit Role & RBAC
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Data Freshness & Stale Review Queue Tab */}
            {activeTab === 'freshness' && (
              <div>
                <StaleRecordsReviewQueue />
              </div>
            )}

            {/* Process Bottleneck Feedback Loop Tab */}
            {activeTab === 'bottlenecks' && (
              <div>
                <BottleneckFeedbackDashboard />
              </div>
            )}

            {/* Notices & Gazette Digest Tab */}
            {activeTab === 'notices' && (
              <div>
                <NoticeManagementPanel />
                <AvailabilityNoticePanel />
              </div>
            )}

            {/* Audit Trail Tab */}
            {activeTab === 'audit' && (
              <div>
                <AuditLogViewer auditLogs={auditLogs} />
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <ConfirmationDialog
          isOpen={Boolean(pendingAction)}
          title={pendingAction?.dialog.title}
          message={pendingAction?.dialog.message}
          itemName={pendingAction?.dialog.itemName}
          confirmLabel={
            actionError
              ? 'Try again'
              : pendingAction?.dialog.confirmLabel
          }
          cancelLabel={pendingAction?.dialog.cancelLabel}
          variant="danger"
          isLoading={isActionRunning}
          errorMessage={actionError}
          onConfirm={runPendingAction}
          onCancel={handleCancelPendingAction}
        />

        <ServiceModal
          isOpen={serviceModal.isOpen}
          serviceToEdit={serviceModal.service}
          onClose={() =>
            setServiceModal({ isOpen: false, service: null })
          }
          onSave={handleSaveService}
        />

        <ReportResolutionModal
          isOpen={reportModal.isOpen}
          report={reportModal.report}
          onClose={() =>
            setReportModal({ isOpen: false, report: null })
          }
          onResolve={handleResolveReport}
          onDismiss={handleDismissReport}
          onEditService={handleEditServiceFromReport}
        />

        <RoleManagementModal
          isOpen={roleModal.isOpen}
          targetUser={roleModal.targetUser}
          onClose={() =>
            setRoleModal({ isOpen: false, targetUser: null })
          }
          onSaveRole={handleSaveRole}
        />

        <ServiceSubmissionReviewModal
          isOpen={submissionModal.isOpen}
          submission={submissionModal.submission}
          onClose={() =>
            setSubmissionModal({ isOpen: false, submission: null })
          }
          onApprove={handleApproveSubmission}
          onReject={handleRejectSubmission}
        />
      </div>
    </div>
  );
};

export default Admin;