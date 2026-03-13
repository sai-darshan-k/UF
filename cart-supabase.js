// cart-supabase.js — shared Supabase cart for plant detail pages (geranium.html etc.)
// Drop this script into any plantX.html after the supabase CDN script tag.
// Usage:
//   await PlantCart.add({ plantId, varietyIdx, varietyName, plantName, price, svgColor, photo, nursery })
//   await PlantCart.getAll()        → array of cart rows
//   await PlantCart.getCount()      → total qty number
//   await PlantCart.remove(rowId)
//   await PlantCart.updateQty(rowId, newQty)

const PlantCart = (() => {
  const SUPABASE_URL = 'https://ujmpogomwcqbotvgdggo.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbXBvZ29td2NxYm90dmdkZ2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDc3NzcsImV4cCI6MjA4ODcyMzc3N30.rnlT2ok31ureULFPjWm2TBp6DOB_zU7y_rL9EAf9Kbk';

  // Lazily create client — safe if supabase CDN not yet loaded
  let _client = null;
  function sb() {
    if (!_client) _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  // Session ID for guest users (persisted in localStorage)
  function sessionId() {
    let sid = localStorage.getItem('uf_session_id');
    if (!sid) {
      sid = 'guest_' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem('uf_session_id', sid);
    }
    return sid;
  }

  function userId() {
    const u = JSON.parse(localStorage.getItem('uf_user') || 'null');
    return u?.id || null;
  }

  // Build Supabase filter for this user/guest
  function applyFilter(q) {
    const uid = userId();
    return uid ? q.eq('user_id', uid) : q.eq('session_id', sessionId());
  }

  async function _headers() {
    const { data: { session } } = await sb().auth.getSession();
    const token = session?.access_token || SUPABASE_ANON_KEY;
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  // ── GET ALL ──
  async function getAll() {
    try {
      let q = sb().from('carts').select('*').order('created_at');
      q = applyFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('PlantCart.getAll error', e);
      return [];
    }
  }

  // ── GET COUNT ──
  async function getCount() {
    const items = await getAll();
    return items.reduce((s, i) => s + (i.qty || 1), 0);
  }

  // ── ADD ITEM ──
  // item = { plantId, varietyIdx, varietyName, plantName, price, svgColor, photo, nursery }
  async function add(item) {
    try {
      const uid  = userId();
      const sid  = sessionId();
      const vIdx = item.varietyIdx ?? -1;

      // Check existing
      let q = sb().from('carts').select('*')
        .eq('plant_id', item.plantId)
        .eq('variety_idx', vIdx);
      q = applyFilter(q);
      const { data: existing } = await q.maybeSingle();

      if (existing) {
        // Increment qty
        const newQty = existing.qty + 1;
        let uq = sb().from('carts')
          .update({ qty: newQty, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        const { data, error } = await uq.select().single();
        if (error) throw error;
        return data;
      }

      // Insert new row
      const row = {
        plant_id:     item.plantId,
        plant_name:   item.plantName,
        variety_idx:  vIdx,
        variety_name: item.varietyName || null,
        price:        item.price,
        qty:          1,
        photo:        item.photo || null,
        svg_color:    item.svgColor || null,
        nursery:      item.nursery || null,
        updated_at:   new Date().toISOString()
      };
      if (uid) row.user_id    = uid;
      else      row.session_id = sid;

      const { data, error } = await sb().from('carts').insert(row).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('PlantCart.add error', e);
      return null;
    }
  }

  // ── UPDATE QTY ──
  async function updateQty(rowId, newQty) {
    try {
      if (newQty <= 0) return remove(rowId);
      const { data, error } = await sb().from('carts')
        .update({ qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', rowId)
        .select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('PlantCart.updateQty error', e);
      return null;
    }
  }

  // ── REMOVE ──
  async function remove(rowId) {
    try {
      const { error } = await sb().from('carts').delete().eq('id', rowId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('PlantCart.remove error', e);
      return false;
    }
  }

  // ── IS IN CART? ── (by plantId + varietyIdx)
  async function isInCart(plantId, varietyIdx = -1) {
    try {
      let q = sb().from('carts').select('id')
        .eq('plant_id', plantId)
        .eq('variety_idx', varietyIdx);
      q = applyFilter(q);
      const { data } = await q.maybeSingle();
      return !!data;
    } catch {
      return false;
    }
  }

  return { getAll, getCount, add, updateQty, remove, isInCart };
})();