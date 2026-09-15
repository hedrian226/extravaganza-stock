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

  async logActivity(action, itemId = null, itemName = null, details = '') {
    const user = await this.getCurrentUser();
    if (!user) return false;
    const { error } = await supabaseClient.from('activity_logs').insert({
      user_id: user.id,
      action: String(action || 'activity'),
      item_id: itemId || null,
      item_name: itemName || null,
      details: String(details || ''),
    });
    if (error) {
      console.warn('Activity log unavailable:', error.message || error);
      return false;
    }
    return true;
  },

  async getActivityLog(limit = 40) {
    const user = await this.getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabaseClient
      .from('activity_logs')
      .select('id,action,item_id,item_name,details,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 40, 1), 100));
    if (error) throw error;
    const labels = {
      login: 'Signed in',
      add_item: 'Added item',
      update_item: 'Edited item',
      adjust_quantity: 'Adjusted quantity',
      undo_quantity: 'Undid quantity change',
      delete_item: 'Deleted item',
      import_stock: 'Imported stock',
      settings_change: 'Changed settings',
    };
    return (data || []).map(row => ({
      id: row.id,
      actionLabel: labels[row.action] || row.action || 'Activity',
      itemName: row.item_name || '',
      details: row.item_name && row.details && !String(row.details).toLowerCase().includes(String(row.item_name).toLowerCase())
        ? `${row.item_name} — ${row.details}`
        : (row.details || row.item_name || ''),
      createdAt: row.created_at,
    }));
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
