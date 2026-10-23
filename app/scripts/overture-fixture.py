#!/usr/bin/env python3
"""Erzeugt tests/fixtures/overture-places.parquet: kleine Nachbildung einer Overture-Places-Datei (Schema wie Release
2026-10-21.0, ZSTD, kleine Zeilengruppen). Namen/Kategorien/Zuverlässigkeit aus Jans Test vom 23.10.2026 (Raum Bremen),
dazu Grenzfälle (geschlossen, Ausland, außerhalb Deutschlands). Aufruf: python3 scripts/overture-fixture.py"""
import duckdb, os
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'fixtures', 'overture-places.parquet')
rows = [
 # id, name, taxonomy.primary, basic_category, conf, lon, lat, status, country, freeform, postcode, locality, website
 ('ov-leo', "Leo's Abenteuerpark", 'amusement_park', 'amusement_park', 1.0, 8.8301, 53.0905, 'open', 'DE', 'Löwenhof 4', '28217', 'Bremen', 'https://leosabenteuerpark.de'),
 ('ov-abl', 'Bremer Abenteuerland', 'kids_recreation_and_party', 'event_or_party_service', 1.0, 8.75, 53.10, 'open', 'DE', None, None, 'Bremen', None),
 ('ov-kiddo', 'Erlebniswelt Kiddo Bremen', 'amusement_park', 'amusement_park', 0.92, 8.86, 53.06, 'open', 'DE', None, None, None, None),
 ('ov-coolisse', 'Spiel Coolisse im Weserpark GmbH', 'kids_recreation_and_party', 'event_or_party_service', 0.99, 8.96, 53.06, 'open', 'DE', None, None, None, None),
 ('ov-reit', 'Reitclub Buchenhof e.V', 'amusement_park', 'amusement_park', 1.0, 8.70, 53.15, 'open', 'DE', None, None, None, None),
 ('ov-spi', 'Spielplatzinitiative Vasmerstraße', 'amusement_park', 'amusement_park', 0.77, 8.81, 53.09, 'open', 'DE', None, None, None, None),
 ('ov-freimarkt', 'Freimarkt Bremen', 'amusement_park', 'amusement_park', 0.88, 8.80, 53.09, 'open', 'DE', None, None, None, None),
 ('ov-smaland', 'Småland', 'indoor_playcenter', 'indoor_playcenter', 0.8, 8.88, 53.05, 'open', 'DE', None, None, None, None),
 ('ov-space', 'Space Center Bremen', 'amusement_park', 'amusement_park', 0.98, 8.82, 53.12, 'open', 'DE', None, None, None, None),
 ('ov-kek', 'kek-Kindermuseum für Bremen', 'childrens_museum', 'museum', 0.91, 8.79, 53.07, 'open', 'DE', None, None, None, None),
 ('ov-hof', 'Kinderbauernhof Tenever St. Petri', 'petting_zoo', 'zoo', 0.99, 8.96, 53.05, 'open', 'DE', None, None, None, None),
 ('ov-neustadt', 'Indoorspielplatz Bremen Neustadt', 'park', 'park', 0.7, 8.79, 53.06, 'open', 'DE', None, None, None, None),
 ('ov-jump', 'JUMP House Bremen', 'event_venue', 'event_venue', 0.98, 8.85, 53.11, 'open', 'DE', None, None, None, None),
 ('ov-hostel', 'HafenTraum Indoor Hostel Camp', 'hostel', 'lodging', 1.0, 8.77, 53.11, 'open', 'DE', None, None, None, None),
 ('ov-mega', 'Mega Hüpfburgenland', 'kids_recreation_and_party', 'event_or_party_service', 0.62, 8.72, 53.03, 'open', 'DE', None, None, None, None),
 ('ov-zu', 'Indoorspielplatz Zu', 'indoor_playcenter', 'indoor_playcenter', 0.95, 8.74, 53.04, 'permanently_closed', 'DE', None, None, None, None),
 ('ov-nl', 'Ballorig Enschede', 'indoor_playcenter', 'indoor_playcenter', 0.95, 7.00, 52.20, 'open', 'NL', None, None, None, None),
 ('ov-zoo', 'Tiergarten Ludwigslust', 'zoo', 'zoo', 1.0, 8.80, 53.10, 'open', 'DE', None, None, None, None),
 ('ov-trampo', 'Superfly Hamburg', 'trampoline_park', 'trampoline_park', 0.9, 10.00, 53.55, 'open', 'DE', None, None, None, None),
 ('ov-paris', 'Royal Kids Paris', 'indoor_playcenter', 'indoor_playcenter', 0.99, 2.35, 48.85, 'open', 'FR', None, None, None, None),
 ('ov-paris2', 'Indoorspielplatz Paris', 'indoor_playcenter', 'indoor_playcenter', 0.99, 2.36, 48.86, 'open', 'FR', None, None, None, None),
]
# Oberbereich wie in Overture (taxonomy.hierarchy[0]) – laut Jans Ausgabe vom 23.10.2026
ROOT = {'amusement_park': 'arts_and_entertainment', 'kids_recreation_and_party': 'services_and_business', 'indoor_playcenter': 'arts_and_entertainment',
        'childrens_museum': 'attractions_and_activities', 'petting_zoo': 'attractions_and_activities', 'park': 'sports_and_recreation',
        'event_venue': 'arts_and_entertainment', 'hostel': 'lodging', 'zoo': 'attractions_and_activities', 'trampoline_park': 'sports_and_recreation'}
c = duckdb.connect()
c.sql("""CREATE TABLE t (id VARCHAR, name VARCHAR, cat VARCHAR, basic VARCHAR, conf DOUBLE, root VARCHAR, lon DOUBLE, lat DOUBLE, st VARCHAR,
 country VARCHAR, freeform VARCHAR, postcode VARCHAR, locality VARCHAR, web VARCHAR)""")
c.executemany('INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [r[:5] + (ROOT[r[2]],) + r[5:] for r in rows])
tbl = c.sql(f"""SELECT id,
  {{'xmin': lon::FLOAT, 'xmax': (lon+0.0001)::FLOAT, 'ymin': lat::FLOAT, 'ymax': (lat+0.0001)::FLOAT}} AS bbox,
  {{'primary': name, 'common': MAP {{}}::MAP(VARCHAR, VARCHAR), 'rules': NULL::STRUCT(variant VARCHAR, value VARCHAR)[]}} AS names,
  basic AS basic_category,
  {{'primary': cat, 'hierarchy': [root, cat], 'alternates': NULL::VARCHAR[]}} AS taxonomy,
  conf AS confidence,
  CASE WHEN web IS NULL THEN NULL ELSE [web] END AS websites,
  [{{'freeform': freeform, 'locality': locality, 'postcode': postcode, 'region': NULL::VARCHAR, 'country': country}}] AS addresses,
  st AS operating_status
 FROM t ORDER BY CASE WHEN country = 'FR' THEN 1 ELSE 0 END, id""").arrow()
import pyarrow.parquet as pq
pq.write_table(tbl.read_all() if hasattr(tbl, "read_all") else tbl, out, compression="zstd", row_group_size=4)
print(out, os.path.getsize(out))
