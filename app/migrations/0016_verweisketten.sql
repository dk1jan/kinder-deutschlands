-- F-032: Beim automatischen Zusammenführen (F-029) konnten Verweisketten entstehen (A → B → C, wenn drei Orte am selben
-- Punkt lagen). Einmalig auf den endgültigen Ort umbiegen; seitdem verhindert mergePlaces neue Ketten.
WITH RECURSIVE chain AS (
	SELECT id, merged_into AS target FROM places WHERE status = 'zusammengefuehrt' AND merged_into IS NOT NULL
	UNION ALL
	SELECT c.id, p.merged_into FROM chain c JOIN places p ON p.id = c.target
	WHERE p.status = 'zusammengefuehrt' AND p.merged_into IS NOT NULL
)
UPDATE places p SET merged_into = f.target
FROM (SELECT c.id, c.target FROM chain c JOIN places t ON t.id = c.target WHERE t.status <> 'zusammengefuehrt') f
WHERE p.id = f.id AND p.merged_into IS DISTINCT FROM f.target;
