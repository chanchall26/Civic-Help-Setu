import { Link } from 'react-router-dom';

// Old records store a plain date, new ones a full timestamp: show the viewer's local day for both.
const archivedDay = (value) => {
  if (typeof value !== 'string' || !value.includes('T')) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Shown on a service page when the guide has been archived (retired). */
const RetiredServiceNotice = ({ service }) => {
  if (!service || service.archived !== true) return null;
  return (
    <div className="retired-notice" role="status">
      <h2 className="retired-notice__title">This service guide has been retired</h2>
      <p className="retired-notice__text">
        It is no longer in the public directory
        {service.archivedAt ? ` (archived ${archivedDay(service.archivedAt)})` : ''}, so the details below may be out of date.
        Check the official source before relying on them.
      </p>
      <Link to="/services" className="btn btn-secondary">
        Browse current services
      </Link>
    </div>
  );
};

export default RetiredServiceNotice;
