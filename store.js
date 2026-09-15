/* =========================================================================
   SHARED DATA LAYER
   Used by both index.html (viewer) and manager.html (inputer).
   Nothing about items, quantities, or credentials is hardcoded anywhere —
   it all flows through here.

   Moving to Supabase later: keep these function names/shapes the same and
   swap the localStorage calls inside each one for the matching
   supabase-js calls. Notes on exactly what to change are at the bottom of
   manager.html.
   ========================================================================= */
const LS_CONFIG = 'exb_config';
const LS_PRODUCTS = 'exb_products';

const Store = {
  // Supabase equivalent: select single row from a "settings" table
  async getConfig() {
    const raw = localStorage.getItem(LS_CONFIG);
    return raw ? JSON.parse(raw) : null;
  },
  // Supabase equivalent: upsert into "settings" table
  async setConfig(cfg) {
    localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
    return cfg;
  },
  // Supabase equivalent: supabase.from('items').select('*').order(...)
  async getProducts() {
    const raw = localStorage.getItem(LS_PRODUCTS);
    return raw ? JSON.parse(raw) : [];
  },
  async saveProducts(list) {
    localStorage.setItem(LS_PRODUCTS, JSON.stringify(list));
    return list;
  },
  // Supabase equivalent: supabase.from('items').insert({...})
  async addProduct(product) {
    const list = await this.getProducts();
    const newItem = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: product.name,
      quantity: product.quantity,
      updatedAt: new Date().toISOString(),
    };
    list.push(newItem);
    await this.saveProducts(list);
    return newItem;
  },
  // Supabase equivalent: supabase.from('items').update({...}).eq('id', id)
  async updateProduct(id, patch) {
    const list = await this.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    await this.saveProducts(list);
    return list[idx];
  },
  // Supabase equivalent: supabase.from('items').delete().eq('id', id)
  async deleteProduct(id) {
    const list = await this.getProducts();
    const next = list.filter(p => p.id !== id);
    await this.saveProducts(next);
    return true;
  },
};

function computeStatus(product) {
  const qty = Number(product.quantity) || 0;
  return qty > 0 ? { key: 'in', label: 'Has stock' } : { key: 'out', label: 'No stock' };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
