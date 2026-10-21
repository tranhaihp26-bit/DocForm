import { COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PARENT, COMPANY_HEADER_HD05_ISSUER } from '../canonical/hd05/companyHeaderHD05.ts';

export type IssuerProfile = {
  id: string;
  name: string;
  regime: 'state' | 'party';
  orgHeader1: string;
  orgHeader2: string;
  builtIn?: boolean;
};

const STORAGE_KEY = 'docform.issuer-profiles.v1';

export const BUILT_IN_ISSUER_PROFILES: IssuerProfile[] = [
  { id: 'built-in-hoa-tieu-nd30', name: 'Hoa tiêu miền Bắc · NĐ30', regime: 'state', orgHeader1: COMPANY_HEADER_PARENT, orgHeader2: COMPANY_HEADER_ISSUER, builtIn: true },
  { id: 'built-in-hoa-tieu-hd05', name: 'Hoa tiêu miền Bắc · HD05', regime: 'party', orgHeader1: COMPANY_HEADER_HD05_PARENT, orgHeader2: COMPANY_HEADER_HD05_ISSUER, builtIn: true },
];

export function loadIssuerProfiles(): IssuerProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is IssuerProfile => item && typeof item.id === 'string' && typeof item.name === 'string'
      && (item.regime === 'state' || item.regime === 'party') && typeof item.orgHeader1 === 'string'
      && typeof item.orgHeader2 === 'string' && !item.builtIn);
  } catch {
    return [];
  }
}

export function saveIssuerProfiles(profiles: IssuerProfile[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.filter(profile => !profile.builtIn)));
    return true;
  } catch {
    return false;
  }
}
