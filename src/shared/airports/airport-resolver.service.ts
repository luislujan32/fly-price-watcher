import { Injectable } from '@nestjs/common';

export type Airport = {
  code: string;
  city: string;
  shortName?: string;
  province?: string;
  name: string;
  aliases: string[];
};

export type AirportResolution =
  | { type: 'none' }
  | { type: 'single'; airport: Airport }
  | { type: 'multiple'; airports: Airport[] };

export const ARGENTINA_AIRPORTS: Airport[] = [
  { code: 'JUJ', city: 'San Salvador de Jujuy', shortName: 'San Salvador de Jujuy', province: 'Jujuy', name: 'Gobernador Horacio Guzmán', aliases: ['Jujuy', 'El Cadillal'] },
  { code: 'AEP', city: 'Buenos Aires', shortName: 'Aeroparque', province: 'CABA', name: 'Aeroparque Jorge Newbery', aliases: ['Aeroparque', 'Jorge Newbery', 'Buenos Aires Aeroparque', 'CABA'] },
  { code: 'EZE', city: 'Buenos Aires', shortName: 'Ezeiza', province: 'Buenos Aires', name: 'Ezeiza Ministro Pistarini', aliases: ['Ezeiza', 'Ministro Pistarini', 'Buenos Aires Ezeiza'] },
  { code: 'MDZ', city: 'Mendoza', shortName: 'Mendoza', province: 'Mendoza', name: 'El Plumerillo', aliases: ['Mendoza'] },
  { code: 'COR', city: 'Córdoba', shortName: 'Córdoba', province: 'Córdoba', name: 'Ingeniero Aeronáutico Ambrosio Taravella', aliases: ['Cordoba', 'Pajas Blancas', 'Taravella'] },
  { code: 'SLA', city: 'Salta', shortName: 'Salta', province: 'Salta', name: 'Martín Miguel de Güemes', aliases: ['Martin Miguel de Guemes'] },
  { code: 'TUC', city: 'Tucumán', shortName: 'Tucumán', province: 'Tucumán', name: 'Teniente Benjamín Matienzo', aliases: ['Tucuman', 'Benjamin Matienzo', 'Teniente Benjamin Matienzo'] },
  { code: 'IGR', city: 'Puerto Iguazú', shortName: 'Iguazú', province: 'Misiones', name: 'Cataratas del Iguazú', aliases: ['Iguazú', 'Iguazu', 'Puerto Iguazu', 'Cataratas'] },
  { code: 'BRC', city: 'San Carlos de Bariloche', shortName: 'Bariloche', province: 'Río Negro', name: 'Bariloche', aliases: ['Bariloche'] },
  { code: 'USH', city: 'Ushuaia', shortName: 'Ushuaia', province: 'Tierra del Fuego', name: 'Malvinas Argentinas', aliases: ['Ushuaia'] },
  { code: 'FTE', city: 'El Calafate', name: 'El Calafate', aliases: ['Calafate'] },
  { code: 'NQN', city: 'Neuquén', shortName: 'Neuquén', province: 'Neuquén', name: 'Presidente Perón', aliases: ['Neuquen', 'Presidente Peron'] },
  { code: 'ROS', city: 'Rosario', name: 'Rosario', aliases: ['Islas Malvinas'] },
  { code: 'BHI', city: 'Bahía Blanca', name: 'Bahía Blanca', aliases: ['Bahia Blanca'] },
  { code: 'REL', city: 'Trelew', name: 'Trelew', aliases: ['Almirante Zar'] },
  { code: 'CRD', city: 'Comodoro Rivadavia', name: 'Comodoro Rivadavia', aliases: ['General Mosconi'] },
  { code: 'RGA', city: 'Río Grande', name: 'Río Grande', aliases: ['Rio Grande'] },
  { code: 'RES', city: 'Resistencia', name: 'Resistencia', aliases: [] },
  { code: 'FMA', city: 'Formosa', name: 'Formosa', aliases: [] },
  { code: 'CNQ', city: 'Corrientes', name: 'Corrientes', aliases: [] },
  { code: 'PSS', city: 'Posadas', name: 'Posadas', aliases: [] },
  { code: 'RSA', city: 'Santa Rosa', name: 'Santa Rosa', aliases: [] },
  { code: 'LUQ', city: 'San Luis', name: 'San Luis', aliases: [] },
  { code: 'UAQ', city: 'San Juan', name: 'San Juan', aliases: [] },
  { code: 'IRJ', city: 'La Rioja', name: 'La Rioja', aliases: [] },
  { code: 'CTC', city: 'Catamarca', name: 'Catamarca', aliases: [] },
  { code: 'RGL', city: 'Río Gallegos', name: 'Río Gallegos', aliases: ['Rio Gallegos'] },
];

@Injectable()
export class AirportResolverService {
  resolve(input: string): AirportResolution {
    const query = normalize(input);
    if (!query) {
      return { type: 'none' };
    }

    const codeMatch = ARGENTINA_AIRPORTS.find((airport) => normalize(airport.code) === query);
    if (codeMatch) {
      return { type: 'single', airport: codeMatch };
    }

    const matches = ARGENTINA_AIRPORTS.filter((airport) => this.matches(airport, query));
    if (!matches.length) {
      return { type: 'none' };
    }
    if (matches.length === 1) {
      return { type: 'single', airport: matches[0] as Airport };
    }
    return { type: 'multiple', airports: matches };
  }

  findByCode(code?: string): Airport | undefined {
    return ARGENTINA_AIRPORTS.find((airport) => airport.code === code);
  }

  label(airportOrCode?: Airport | string): string {
    const airport = typeof airportOrCode === 'string' ? this.findByCode(airportOrCode) : airportOrCode;
    if (!airport) {
      return typeof airportOrCode === 'string' ? airportOrCode : 'N/D';
    }
    return `${airport.code} — ${airport.city}${airport.city === airport.name ? '' : ` ${airport.name}`}`;
  }

  private matches(airport: Airport, query: string): boolean {
    const values = [airport.code, airport.city, airport.province, airport.name, ...airport.aliases]
      .filter((value): value is string => Boolean(value))
      .map(normalize);
    return values.some((value) => value === query || value.includes(query));
  }
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
