import { useState } from 'react';
import AccessibleModal from '../common/AccessibleModal';
import {
  QUEUE_STATUSES,
  MAX_TEAM_LENGTH,
  MAX_NOTE_LENGTH,
  normalizeOwnership,
  validateOwnership,
} from '../../services/serviceOwnershipService';

const staffRoles = new Set(['admin', 'moderator', 'editor']);

/** The form itself. It is remounted (see the key below) for every record, so it can start from props. */
const OwnershipForm = ({ service, current, users, onSave, onClear, onClose }) => {
  const record = normalizeOwnership(current);
  const [form, setForm] = useState({
    reviewerId: record?.reviewerId || '',
    team: record?.team || '',
    queueStatus: record?.queueStatus || 'none',
    privateNote: record?.privateNote || '',
  });
  const [errors, setErrors] = useState({});

  const reviewers = users.filter((u) => u && staffRoles.has(u.role));
  const savedReviewerMissing = form.reviewerId && !users.some((u) => u && u.id === form.reviewerId);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const checked = validateOwnership(form, users);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    const result = onSave(service.id, form);
    if (result && result.ok === false) setErrors(result.errors || {});
    else onClose();
  };

  const handleClear = () => {
    const cleared = onClear(service.id);
    if (cleared === false) setErrors({ save: 'Could not clear the assignment on this device.' });
    else onClose();
  };

  const err = (key) => (errors[key] ? <p id={`own-err-${key}`} role="alert" className="ownership-form__error">{errors[key]}</p> : null);

  return (
    <form className="ownership-form" onSubmit={handleSubmit} noValidate>
      <div className="ownership-form__field">
        <label htmlFor="own-reviewer">Assigned reviewer</label>
        <select
          id="own-reviewer"
          className="input-field"
          value={form.reviewerId}
          onChange={set('reviewerId')}
          aria-invalid={Boolean(errors.reviewerId || errors.owner)}
          aria-describedby={errors.reviewerId ? 'own-err-reviewerId' : undefined}
        >
          <option value="">No individual reviewer</option>
          {savedReviewerMissing && <option value={form.reviewerId}>Previously assigned (account unavailable)</option>}
          {reviewers.map((u) => (
            <option key={u.id} value={u.id}>{u.username || u.email || u.id} ({u.role})</option>
          ))}
        </select>
        {err('reviewerId')}
      </div>

      <div className="ownership-form__field">
        <label htmlFor="own-team">Team</label>
        <input
          id="own-team"
          className="input-field"
          type="text"
          value={form.team}
          maxLength={MAX_TEAM_LENGTH + 20}
          onChange={set('team')}
          aria-invalid={Boolean(errors.team || errors.owner)}
          aria-describedby={errors.team ? 'own-err-team' : undefined}
        />
        {err('team')}
      </div>
      {err('owner')}

      <div className="ownership-form__field">
        <label htmlFor="own-status">Queue status</label>
        <select id="own-status" className="input-field" value={form.queueStatus} onChange={set('queueStatus')}>
          {Object.entries(QUEUE_STATUSES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {err('queueStatus')}
      </div>

      <div className="ownership-form__field">
        <label htmlFor="own-note">Private review note</label>
        <textarea
          id="own-note"
          className="input-field"
          rows={3}
          value={form.privateNote}
          onChange={set('privateNote')}
          aria-describedby={`own-note-hint${errors.privateNote ? ' own-err-privateNote' : ''}`}
          aria-invalid={Boolean(errors.privateNote)}
        />
        <p id="own-note-hint" className="ownership-form__hint">
          Visible to admins only, up to {MAX_NOTE_LENGTH} characters. No email or notification is sent.
        </p>
        {err('privateNote')}
      </div>
      {err('save')}

      <div className="ownership-form__actions">
        <button type="submit" className="btn btn-primary">Save assignment</button>
        {current && (
          <button type="button" className="btn btn-secondary" onClick={handleClear}>
            Clear assignment
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
};

/** Assign or reassign the reviewer, team, queue status and private note of one service guide. Admin page only. */
const ServiceOwnershipModal = ({ isOpen, onClose, service, current, users = [], onSave, onClear }) => {
  if (!service) return null;
  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Review assignment"
      subtitle={`Internal only. Not shown on the public page for ${service.name}.`}
      maxWidth="520px"
    >
      <OwnershipForm
        key={`${service.id}:${current?.assignedAt || ''}`}
        service={service}
        current={current}
        users={Array.isArray(users) ? users : []}
        onSave={onSave}
        onClear={onClear}
        onClose={onClose}
      />
    </AccessibleModal>
  );
};

export default ServiceOwnershipModal;
