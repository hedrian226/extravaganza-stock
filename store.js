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
    unit: ['PCS', 'PACK', 'CASE'].includes(String(row.unit || '').toUpperCase()) ? String(row.unit).toUpperCase() : 'PCS',
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
      .select('id,name,quantity,unit,updated_at')
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
        unit: ['PCS', 'PACK', 'CASE'].includes(String(product.unit || '').toUpperCase()) ? String(product.unit).toUpperCase() : 'PCS',
        user_id: user.id,
      })
      .select('id,name,quantity,unit,updated_at')
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
    if (patch.unit !== undefined) update.unit = ['PCS', 'PACK', 'CASE'].includes(String(patch.unit || '').toUpperCase()) ? String(patch.unit).toUpperCase() : 'PCS';
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from('items')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id,name,quantity,unit,updated_at')
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
      lowStockThreshold: Number.isFinite(Number(data?.lowStockThreshold))
        ? Number(data.lowStockThreshold)
        : DEFAULT_LOW_STOCK_THRESHOLD,
    };
  },

  /* manager's own low-stock threshold (used to color-code the dashboard) */
  async getAppSettings() {
    const { data, error } = await supabaseClient.rpc('get_app_settings');
    if (error) throw error;
    return {
      lowStockThreshold: Number.isFinite(Number(data?.lowStockThreshold))
        ? Number(data.lowStockThreshold)
        : DEFAULT_LOW_STOCK_THRESHOLD,
    };
  },

  async setLowStockThreshold(threshold) {
    const { error } = await supabaseClient.rpc('set_low_stock_threshold', {
      p_threshold: Number(threshold),
    });
    if (error) throw error;
    return true;
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

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function computeStatus(product, threshold) {
  const qty = Number(product.quantity) || 0;
  const t = Number.isFinite(Number(threshold)) ? Number(threshold) : DEFAULT_LOW_STOCK_THRESHOLD;
  if (qty <= 0) return { key: 'out', label: 'No stock' };
  if (qty <= t) return { key: 'low', label: 'Low stock' };
  return { key: 'in', label: 'Has stock' };
}

/* ---------------------------------------------------------------------
   ACCESS-CODE GUARD — basic client-side brute-force throttle for the
   viewer gate. This raises the bar against casual/automated guessing
   from the sign-in form; it isn't a substitute for server-side limits,
   but it's a reasonable safeguard for a small shop's use case.
   ------------------------------------------------------------------- */
const AccessGate = (function () {
  const KEY = 'exb_gate_state';
  const FREE_ATTEMPTS = 3;              // this many misses before any wait
  const LOCK_SCHEDULE_MS = [15000, 30000, 60000, 120000, 300000]; // 15s..5min

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { fails: 0, lockUntil: 0 };
    } catch (e) {
      return { fails: 0, lockUntil: 0 };
    }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  return {
    /** Returns { locked, remainingMs } — call before submitting. */
    checkLock() {
      const state = read();
      const remaining = state.lockUntil - Date.now();
      if (remaining > 0) return { locked: true, remainingMs: remaining };
      return { locked: false, remainingMs: 0 };
    },
    recordFailure() {
      const state = read();
      state.fails = (state.fails || 0) + 1;
      const overBy = state.fails - FREE_ATTEMPTS;
      if (overBy > 0) {
        const idx = Math.min(overBy - 1, LOCK_SCHEDULE_MS.length - 1);
        state.lockUntil = Date.now() + LOCK_SCHEDULE_MS[idx];
      }
      write(state);
      return state;
    },
    recordSuccess() {
      write({ fails: 0, lockUntil: 0 });
    },
  };
})();

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
