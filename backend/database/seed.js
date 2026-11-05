// Seeds CONFIGURATION defaults only (categories, products, option lists). No sample operational data.
const db = require('./db');

const CATEGORIES = [
  ['Eye Tracking', '#6D4AFF', ['Existing User Journey', 'New User Journey', 'New Product', 'Existing Screen', 'New Screen', 'Other']],
  ['User Interviews', '#16A34A', ['Customer Feedback', 'Product Experience', 'Customer Pain Points', 'Concept Exploration', 'Other']],
  ['Usability Testing', '#F59E0B', ['Existing Product Testing', 'New Product Testing', 'Prototype Testing', 'Screen Usability', 'Other']],
  ['Other', '#64748B', ['Other']],
];
const PRODUCTS = ['JazzCash', 'Reward Hub', 'Easypaisa', 'Receipts', 'Money Transfer', 'Bill Payments', 'QR Payments', 'Other'];
const OPTIONS = {
  age_group: ['18-25', '26-35', '36-45', '46-55', '56+'],
  customer_type: ['JazzCash User', 'Easypaisa User', 'Other Wallet User', 'Non-Customer'],
  digital_behaviour: ['Digitally Native', 'Moderately Digital', 'Low Digital Familiarity'],
  digital_native: ['Yes', 'No'],
  customer_segment: [],
  gender: ['Male', 'Female', 'Other', 'Prefer not to say'],
  product_usage: [],
  screen_suggestion: ['Home Screen', 'Money Transfer', 'Rewards Dashboard', 'Account Opening', 'Transaction Receipt'],
};

function seed() {
  db.tx(() => {
    if (db.get('SELECT COUNT(*) c FROM research_categories').c === 0) {
      CATEGORIES.forEach(([name, color, subs], i) => {
        const { lastId } = db.run('INSERT INTO research_categories(name,color,sort_order) VALUES (?,?,?)', [name, color, i]);
        subs.forEach((s, j) => db.run('INSERT INTO research_subcategories(category_id,name,sort_order) VALUES (?,?,?)', [lastId, s, j]));
      });
    }
    if (db.get('SELECT COUNT(*) c FROM products').c === 0) {
      PRODUCTS.forEach((p, i) => db.run('INSERT INTO products(name,sort_order) VALUES (?,?)', [p, i]));
    }
    if (db.get('SELECT COUNT(*) c FROM lookup_options').c === 0) {
      for (const [type, vals] of Object.entries(OPTIONS)) {
        vals.forEach((v, i) => db.run('INSERT INTO lookup_options(type,value,sort_order) VALUES (?,?,?)', [type, v, i]));
      }
    }
    const defaults = {
      backup_frequency: 'daily',
      backup_retention_days: '30',
      backup_dir_override: '',
      nda_retention_policy: 'Retain signed NDAs permanently unless the company retention policy specifies otherwise.',
    };
    for (const [k, v] of Object.entries(defaults)) {
      db.run('INSERT OR IGNORE INTO application_settings(key,value) VALUES (?,?)', [k, v]);
    }
  });
}

module.exports = { seed };
