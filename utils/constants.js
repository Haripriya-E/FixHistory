/** Values shared by models, validators, services and the seed script. */

export const ASSET_CATEGORIES = [
  'Vehicle',
  'Electronic Device',
  'Home Appliance',
  'Industrial Equipment',
  'Other',
];

export const SERVICE_TYPES = [
  'Regular Maintenance',
  'Repair',
  'Inspection',
  'Part Replacement',
  'Emergency Service',
  'Other',
];

export const WARRANTY_STATUSES = ['active', 'expiring', 'expired', 'none'];

export const NOTIFICATION_TYPES = {
  SERVICE_DUE: 'SERVICE_DUE',
  WARRANTY_EXPIRY: 'WARRANTY_EXPIRY',
  TRANSFER: 'TRANSFER',
};

/** Notification types that are generated automatically from stored dates. */
export const REMINDER_TYPES = [NOTIFICATION_TYPES.SERVICE_DUE, NOTIFICATION_TYPES.WARRANTY_EXPIRY];

export const NOTIFICATION_STATUSES = ['Pending', 'Completed', 'Dismissed'];

export const TRANSFER_STATUSES = ['Pending', 'Completed', 'Cancelled', 'Rejected', 'Expired'];

export const OWNERSHIP_EVENTS = ['Registered', 'Transferred'];

export const AUTH_COOKIE = 'fh_token';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_MIME_TYPES = ['application/pdf', ...IMAGE_MIME_TYPES];

export const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
