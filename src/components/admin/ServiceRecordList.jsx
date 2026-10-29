/**
 * Service catalog list for the admin page.
 *
 * Both layouts are rendered and index.css decides which one is visible, using
 * a container query on this component's own width (640px). A container query is
 * used instead of a viewport media query because the admin sidebar takes about a
 * third of the screen on tablets, so the viewport width says little about how
 * much room the table really has. Where container queries are not supported the
 * table simply stays visible, which is how the page behaved before.
 *
 * The hidden layout uses display: none, so it is out of the tab order and the
 * accessibility tree. Edit and Delete use the same handlers in both layouts.
 */
import { describeOwner, QUEUE_STATUSES, normalizeOwnership } from '../../services/serviceOwnershipService';

const deliveryLabel = (svc) => svc.type || 'Online / Offline';

const cellPadding = { padding: '0.85rem 1rem' };

const OwnerCell = ({ ownership, users, svc }) => {
  const record = normalizeOwnership(ownership?.[svc.id]);
  const owner = describeOwner(record, users);
  const status = record && record.queueStatus !== 'none' ? QUEUE_STATUSES[record.queueStatus] : '';
  return (
    <>
      <span className={`ownership-tag ownership-tag--${owner.state}`}>{owner.label}</span>
      {status && <span className="ownership-status">{status}</span>}
    </>
  );
};

// ownership, users and onAssign are optional: without onAssign the list looks exactly as before.
const ServiceRecordList = ({ services, onEdit, onDelete, ownership = {}, users = [], onAssign }) => (
  <div className="glass-panel admin-records" style={{ borderRadius: '0.85rem', overflow: 'hidden' }}>
    <table
      className="admin-records__table"
      style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}
    >
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-tertiary)', background: 'rgba(0, 0, 0, 0.15)' }}>
          <th style={{ ...cellPadding, fontWeight: '700' }}>Service Name</th>
          <th style={{ ...cellPadding, fontWeight: '700' }}>Category</th>
          <th style={{ ...cellPadding, fontWeight: '700' }}>Delivery Mode</th>
          {onAssign && <th style={{ ...cellPadding, fontWeight: '700' }}>Reviewer / Team</th>}
          <th style={{ ...cellPadding, fontWeight: '700', textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {services.map((svc) => (
          <tr key={svc.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
            <td style={{ ...cellPadding, fontWeight: '600', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {svc.name}
            </td>
            <td style={{ ...cellPadding, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
              {svc.category}
            </td>
            <td style={cellPadding}>
              <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '99px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: '600' }}>
                {deliveryLabel(svc)}
              </span>
            </td>
            {onAssign && (
              <td style={{ ...cellPadding, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                <OwnerCell ownership={ownership} users={users} svc={svc} />
              </td>
            )}
            <td style={{ ...cellPadding, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {onAssign && (
                <button
                  type="button"
                  aria-label={`Assign reviewer for ${svc.name}`}
                  onClick={() => onAssign(svc)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-main)', fontWeight: '600', marginRight: '0.85rem', cursor: 'pointer' }}
                >
                  Assign
                </button>
              )}
              <button
                type="button"
                aria-label={`Edit ${svc.name}`}
                onClick={() => onEdit(svc)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-main)', fontWeight: '600', marginRight: '0.85rem', cursor: 'pointer' }}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Delete ${svc.name}`}
                onClick={() => onDelete(svc.id)}
                style={{ background: 'none', border: 'none', color: 'var(--error, #ef4444)', fontWeight: '600', cursor: 'pointer' }}
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    <ul className="admin-records__cards" aria-label="Service guides">
      {services.map((svc) => (
        <li key={svc.id} className="admin-record-card">
          <h3 className="admin-record-card__name">{svc.name}</h3>
          <dl className="admin-record-card__meta">
            <div>
              <dt>Category</dt>
              <dd>{svc.category}</dd>
            </div>
            <div>
              <dt>Delivery mode</dt>
              <dd>
                <span className="admin-record-card__badge">{deliveryLabel(svc)}</span>
              </dd>
            </div>
            {onAssign && (
              <div>
                <dt>Reviewer / team</dt>
                <dd>
                  <OwnerCell ownership={ownership} users={users} svc={svc} />
                </dd>
              </div>
            )}
          </dl>
          <div className="admin-record-card__actions">
            {onAssign && (
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Assign reviewer for ${svc.name}`}
                onClick={() => onAssign(svc)}
              >
                Assign
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={`Edit ${svc.name}`}
              onClick={() => onEdit(svc)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary admin-record-card__delete"
              aria-label={`Delete ${svc.name}`}
              onClick={() => onDelete(svc.id)}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

export default ServiceRecordList;
