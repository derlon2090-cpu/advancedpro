const { getPool } = require("./db");

async function getSettingsMap() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value
     FROM site_settings`
  );

  return rows.reduce((settings, row) => {
    settings[row.setting_key] = row.setting_value;
    return settings;
  }, {});
}

async function upsertSettings(entries) {
  const pool = getPool();
  const pairs = Object.entries(entries);

  for (const [key, value] of pairs) {
    await pool.query(
      `INSERT INTO site_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    );
  }
}

module.exports = {
  getSettingsMap,
  upsertSettings,
};
