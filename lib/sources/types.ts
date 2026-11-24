// External contact sources: shared types.
export type Provider = "apollo" | "hunter" | "outscraper";
export const PROVIDERS: Provider[] = ["apollo", "hunter", "outscraper"];

/** One person/business found in a source, normalized to our Contacts columns. */
export type Found = {
  key: string; // provider id (Apollo person id, email, Google place id)
  company: string;
  contactName: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  city: string;
  country: string;
  linkedin: string;
  /** The provider says it has an email we can reveal (Apollo search). */
  hasEmail: boolean;
  /** Email must be revealed (costs credits) before it can be added. */
  needsReveal: boolean;
  confidence?: number;
  extra?: string; // short provider-specific note (rating, category…)
};

export type ApolloFilters = {
  titles?: string; // comma separated
  locations?: string; // person locations, comma separated
  orgLocations?: string;
  domains?: string;
  keywords?: string;
  seniorities?: string[];
  employees?: string[]; // "1,10", "11,50" …
  emailStatus?: "verified" | "any";
  page?: number;
  perPage?: number;
};

export type HunterFilters = {
  domain?: string;
  /** Several domains at once (companies picked from a Discover search). */
  domains?: string[];
  company?: string;
  type?: "personal" | "generic" | "all";
  seniority?: string[];
  department?: string[];
  limit?: number;
  offset?: number;
  minConfidence?: number;
};

/** Hunter Discover: free company search by keywords (returns domains, not people). */
export type HunterDiscoverFilters = {
  keywords: string[];
  match?: "any" | "all";
  country?: string; // ISO 3166-1 alpha-2
  city?: string;
  headcount?: string[]; // "1-10", "11-50", …
  limit?: number;
};

export type CompanyHit = { domain: string; name: string; emails: number; personal: number; generic: number; known?: boolean };

export type OutscraperFilters = {
  query: string; // "restaurants, Riyadh"
  limit?: number;
  skip?: number;
  language?: string;
  region?: string;
  findEmails?: boolean;
};

export type SearchResult = {
  items: Found[];
  total?: number;
  page?: number;
  /** Outscraper: the provider is still working; poll with this id. */
  pendingId?: string;
  info?: string;
  /** The provider's plan capped the number of results (e.g. Hunter free plan: 10). */
  planLimited?: number;
};

export type RevealResult = { items: Found[]; credits?: number; missing: number };
