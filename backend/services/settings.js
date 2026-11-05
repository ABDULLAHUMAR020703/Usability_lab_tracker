const db = require('../database/db');
const config = require('../config');
const { bad, notFound, HttpError, str, int, dirSize, logActivity } = require('../utils/helpers');
const research = require('./research');

const OPTION_TYPES = ['age_group', 'customer_type', 'digital_behaviour', 'digital_native', 'customer_segment', 'gender', 'product_usage', 'screen_suggestion', 'owner', 'city', 'occupation'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

function meta() {
  const categories = db.all('SELECT * FROM research_categories ORDER BY sort_order, name');
  const subs = db.all('SELECT * FROM research_subcategories ORDER BY sort_order, name');
  const options = {};
  for (const t of OPTION_TYPES) options[t] = [];
  for (const o of db.all('SELECT * FROM lookup_options WHERE active = 1 ORDER BY sort_order, value')) (options[o.type] ||= []).push(o.value);
  const owners = db.all("SELECT DISTINCT owner v FROM research_studies UNION SELECT DISTINCT name FROM research_team_members UNION SELECT value FROM lookup_options WHERE type='owner' AND active=1 ORDER BY 1").map((r) => r.v);
  const cities = db.all("SELECT DISTINCT city v FROM participants WHERE city IS NOT NULL UNION SELECT value FROM lookup_options WHERE type='city' AND active=1 ORDER BY 1").map((r) => r.v);
  return {
    categories: categories.map((c) => ({ ...c, subcategories: subs.filter((s) => s.category_id === c.id) })),
    products: db.all('SELECT * FROM products ORDER BY sort_order, name'),
    options: { ...options, owner: owners, city: cities },
    statuses: research.STATUSES, results_statuses: research.RESULTS_STATUSES, priorities: research.PRIORITIES,
    attendance_statuses: ['Expected', 'Confirmed', 'Attended', 'Did Not Attend', 'Cancelled'],
  };
}

const dup = (e, what) => { if (/UNIQUE/i.test(e.message)) throw new HttpError(409, `${what} already exists`); throw e; };

function addCategory(b) {
  const name = str(b.name); if (!name) throw bad('Name is required');
  const color = COLOR.test(b.color || '') ? b.color : '#6D4AFF';
  try { return db.run('INSERT INTO research_categories(name,color,sort_order) VALUES (?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM research_categories))', [name, color]); } catch (e) { dup(e, 'Category'); }
}
function updateCategory(id, b) {
  const c = db.get('SELECT * FROM research_categories WHERE id = ?', [id]); if (!c) throw notFound();
  if (b.color && !COLOR.test(b.color)) throw bad('Color must be a hex value like #6D4AFF');
  try { db.run('UPDATE research_categories SET name=?, color=?, active=? WHERE id=?', [str(b.name) || c.name, b.color || c.color, 'active' in b ? (b.active ? 1 : 0) : c.active, id]); } catch (e) { dup(e, 'Category'); }
}
function deleteCategory(id) {
  if (db.get('SELECT 1 FROM research_studies WHERE category_id = ?', [id])) throw new HttpError(409, 'This category is used by research studies. Deactivate it instead.');
  db.run('DELETE FROM research_categories WHERE id = ?', [id]);
}
function addSub(categoryId, b) {
  if (!db.get('SELECT id FROM research_categories WHERE id = ?', [categoryId])) throw notFound('Category not found');
  const name = str(b.name); if (!name) throw bad('Name is required');
  try { return db.run('INSERT INTO research_subcategories(category_id,name,sort_order) VALUES (?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM research_subcategories WHERE category_id=?))', [categoryId, name, categoryId]); } catch (e) { dup(e, 'Subcategory'); }
}
function updateSub(id, b) {
  const s = db.get('SELECT * FROM research_subcategories WHERE id = ?', [id]); if (!s) throw notFound();
  try { db.run('UPDATE research_subcategories SET name=?, active=? WHERE id=?', [str(b.name) || s.name, 'active' in b ? (b.active ? 1 : 0) : s.active, id]); } catch (e) { dup(e, 'Subcategory'); }
}
function deleteSub(id) {
  if (db.get('SELECT 1 FROM research_studies WHERE subcategory_id = ?', [id])) throw new HttpError(409, 'This subcategory is used by research studies. Deactivate it instead.');
  db.run('DELETE FROM research_subcategories WHERE id = ?', [id]);
}
function addProduct(b) {
  const name = str(b.name); if (!name) throw bad('Name is required');
  try { return db.run('INSERT INTO products(name,sort_order) VALUES (?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM products))', [name]); } catch (e) { dup(e, 'Product'); }
}
function updateProduct(id, b) {
  const p = db.get('SELECT * FROM products WHERE id = ?', [id]); if (!p) throw notFound();
  try { db.run('UPDATE products SET name=?, active=? WHERE id=?', [str(b.name) || p.name, 'active' in b ? (b.active ? 1 : 0) : p.active, id]); } catch (e) { dup(e, 'Product'); }
}
function deleteProduct(id) {
  if (db.get('SELECT 1 FROM research_studies WHERE product_id = ?', [id])) throw new HttpError(409, 'This product is used by research studies. Deactivate it instead.');
  db.run('DELETE FROM products WHERE id = ?', [id]);
}

function listOptions(type) { return db.all('SELECT * FROM lookup_options WHERE type = ? ORDER BY sort_order, value', [type]); }
function addOption(type, b) {
  if (!OPTION_TYPES.includes(type)) throw bad('Unknown option type');
  const value = str(b.value); if (!value) throw bad('Value is required');
  try { return db.run('INSERT INTO lookup_options(type,value,sort_order) VALUES (?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM lookup_options WHERE type=?))', [type, value, type]); } catch (e) { dup(e, 'Option'); }
}
function updateOption(id, b) {
  const o = db.get('SELECT * FROM lookup_options WHERE id = ?', [id]); if (!o) throw notFound();
  try { db.run('UPDATE lookup_options SET value=?, active=? WHERE id=?', [str(b.value) || o.value, 'active' in b ? (b.active ? 1 : 0) : o.active, id]); } catch (e) { dup(e, 'Option'); }
}
function deleteOption(id) { db.run('DELETE FROM lookup_options WHERE id = ?', [id]); }

function storageInfo() {
  const storage = dirSize(config.STORAGE_DIR);
  const dbSize = require('fs').existsSync(config.DB_PATH) ? require('fs').statSync(config.DB_PATH).size : 0;
  const backups = dirSize(require('./backup').backupDir());
  return { data_dir: config.DATA_DIR, database_path: config.DB_PATH, database_size: dbSize, storage_dir: config.STORAGE_DIR, storage_size: storage.total, storage_files: storage.count, backup_dir: require('./backup').backupDir(), backup_size: backups.total };
}

module.exports = { meta, addCategory, updateCategory, deleteCategory, addSub, updateSub, deleteSub, addProduct, updateProduct, deleteProduct, listOptions, addOption, updateOption, deleteOption, storageInfo, OPTION_TYPES };
