/* =========================================================================
   SHARED DATA LAYER — SUPABASE
   Used by index.html (viewer) and manager.html (manager).
   ========================================================================= */

const SUPABASE_URL = 'https://mkaejykknygbibebxlob.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-bxouQwbPv_GPDfTfli4Sw_wMYZUGba';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

window.supabaseClient = supabaseClient;

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity) || 0,
    updatedAt: row.updated_at,
  };
}

const Store = {
  async getCurrentUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  async getProducts() {
    const user = await this.getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('items')
      .select('id,name,quantity,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapItem);
  },

  async addProduct(product) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('You must be signed in.');

    const { data, error } = await supabaseClient
      .from('items')
      .insert({
        name: product.name,
        quantity: Number(product.quantity) || 0,
        user_id: user.id,
      })
      .select('id,name,quantity,updated_at')
      .single();

    if (error) throw error;
    return mapItem(data);
  },

  async updateProduct(id, patch) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('You must be signed in.');

    const update = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.quantity !== undefined) update.quantity = Number(patch.quantity) || 0;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from('items')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id,name,quantity,updated_at')
      .single();

    if (error) throw error;
    return mapItem(data);
  },

  async deleteProduct(id) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('You must be signed in.');

    const { error } = await supabaseClient
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  },

  async setViewerCode(code) {
    const { error } = await supabaseClient.rpc('set_viewer_code', {
      p_code: code,
    });
    if (error) throw error;
    return true;
  },

  async getViewerProducts(code) {
    const { data, error } = await supabaseClient.rpc('get_viewer_data', {
      p_code: code,
    });

    if (error) throw error;

    return {
      ok: Boolean(data?.ok),
      products: Array.isArray(data?.items) ? data.items.map(mapItem) : [],
    };
  },

  async updatePassword(password) {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
  },

  async signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
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
