// Die 16 Bundesländer: amtlicher Schlüssel (ARS/AGS, zweistellig), ISO-3166-2 und Name.
export const LAENDER = [
	{ code: '01', iso: 'DE-SH', name: 'Schleswig-Holstein' },
	{ code: '02', iso: 'DE-HH', name: 'Hamburg' },
	{ code: '03', iso: 'DE-NI', name: 'Niedersachsen' },
	{ code: '04', iso: 'DE-HB', name: 'Bremen' },
	{ code: '05', iso: 'DE-NW', name: 'Nordrhein-Westfalen' },
	{ code: '06', iso: 'DE-HE', name: 'Hessen' },
	{ code: '07', iso: 'DE-RP', name: 'Rheinland-Pfalz' },
	{ code: '08', iso: 'DE-BW', name: 'Baden-Württemberg' },
	{ code: '09', iso: 'DE-BY', name: 'Bayern' },
	{ code: '10', iso: 'DE-SL', name: 'Saarland' },
	{ code: '11', iso: 'DE-BE', name: 'Berlin' },
	{ code: '12', iso: 'DE-BB', name: 'Brandenburg' },
	{ code: '13', iso: 'DE-MV', name: 'Mecklenburg-Vorpommern' },
	{ code: '14', iso: 'DE-SN', name: 'Sachsen' },
	{ code: '15', iso: 'DE-ST', name: 'Sachsen-Anhalt' },
	{ code: '16', iso: 'DE-TH', name: 'Thüringen' }
] as const;

export const LAND_CODES: string[] = LAENDER.map((l) => l.code);
export const LAND_ISOS: string[] = LAENDER.map((l) => l.iso);
export const landName = (code: string) => LAENDER.find((l) => l.code === code)?.name ?? code;
