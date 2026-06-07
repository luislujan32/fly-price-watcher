export const JETSMART_AIRPORTS = new Set([
  'AEP', 'EZE', 'COR', 'MDZ', 'BRC', 'IGR', 'NQN', 'SLA', 'TUC', 'REL',
  'FTE', 'CPC', 'CRD', 'USH', 'RES',
]);

export function jetsmartOperates(origin: string, destination: string): boolean {
  return JETSMART_AIRPORTS.has(origin) && JETSMART_AIRPORTS.has(destination);
}
