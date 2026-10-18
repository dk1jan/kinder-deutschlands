-- Einstellungen in der Verwaltung (z. B. E-Mail-Versand). Werte liegen in der bestehenden Tabelle settings,
-- Geheimnisse dort nur verschlüsselt (AES-256-GCM, Schlüssel aus APP_SECRET).
INSERT INTO role_permissions (role_key, action) VALUES ('tech_admin', 'settings.manage')
ON CONFLICT DO NOTHING;
