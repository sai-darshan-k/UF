// cart.js — central cart manager using Supabase

const SUPABASE_URL = 'https://ujmpogomwcqbotvgdggo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbXBvZ29td2NxYm90dmdkZ2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDc3NzcsImV4cCI6MjA4ODcyMzc3N30.rnlT2ok31ureULFPjWm2TBp6DOB_zU7y_rL9EAf9Kbk';

const CartDB = (() => {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Generate or retrieve a guest session ID
  function getSessionId() {
    let sid = localStorage.getItem('uf_session_id');
    if (!sid) {
      sid = 'guest_' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem('uf_session_id', sid);
    }
    return sid;
  }

  function getUserId() {
    const user = JSON.parse(localStorage.getItem('uf_user') || 'null');
    return user?.id || null;
  }

  // Build the filter for this user or guest session
  function cartFilter(query) {
    const userId = getUserId();
    if (userId) {
      return query.eq('user_id', userId);
    } else {
      return query.eq('session_id', getSessionId());
    }
  }

  async function getAll() {
    try {
      const userId = getUserId();
      let query = sb.from('carts').select('*').order('created_at');
      query = cartFilter(query);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Cart fetch error:', e);
      return [];
    }
  }

  async function addItem(item) {
    // item = { plant_id, plant_name, variety_idx, variety_name, price, qty, photo, svg_color, nursery }
    try {
      const userId = getUserId();
      const sessionId = getSessionId();

      // Check if already in cart
      const existing = await getItem(item.plant_id, item.variety_idx ?? -1);

      if (existing) {
        // Update qty
        return await updateQty(item.plant_id, item.variety_idx ?? -1, existing.qty + (item.qty || 1));
      }

      const row = {
        plant_id: item.plant_id,
        plant_name: item.plant_name,
        variety_idx: item.variety_idx ?? -1,
        variety_name: item.variety_name || null,
        price: item.price,
        qty: item.qty || 1,
        photo: item.photo || null,
        svg_color: item.svg_color || null,
        nursery: item.nursery || null,
        updated_at: new Date().toISOString()
      };

      // Attach to user or guest session
      if (userId) {
        row.user_id = userId;
      } else {
        row.session_id = sessionId;
      }

      const { data, error } = await sb.from('carts').insert(row).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Cart add error:', e);
      return null;
    }
  }

  async function getItem(plantId, varIdx = -1) {
    try {
      let query = sb.from('carts')
        .select('*')
        .eq('plant_id', plantId)
        .eq('variety_idx', varIdx);
      query = cartFilter(query);
      const { data } = await query.maybeSingle();
      return data || null;
    } catch (e) {
      return null;
    }
  }

  async function updateQty(plantId, varIdx = -1, newQty) {
    try {
      if (newQty <= 0) return removeItem(plantId, varIdx);

      let query = sb.from('carts')
        .update({ qty: newQty, updated_at: new Date().toISOString() })
        .eq('plant_id', plantId)
        .eq('variety_idx', varIdx);
      query = cartFilter(query);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Cart update error:', e);
      return null;
    }
  }

  async function removeItem(plantId, varIdx = -1) {
    try {
      let query = sb.from('carts')
        .delete()
        .eq('plant_id', plantId)
        .eq('variety_idx', varIdx);
      query = cartFilter(query);
      const { error } = await query;
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Cart remove error:', e);
      return false;
    }
  }

  async function clearCart() {
    try {
      let query = sb.from('carts').delete();
      query = cartFilter(query);
      const { error } = await query;
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Cart clear error:', e);
      return false;
    }
  }

  // When guest logs in — merge their guest cart into their user account
  async function mergeGuestCart(userId) {
    try {
      const sessionId = getSessionId();
      // Get all guest items
      const { data: guestItems } = await sb.from('carts')
        .select('*')
        .eq('session_id', sessionId);

      if (!guestItems || guestItems.length === 0) return;

      for (const item of guestItems) {
        // Check if user already has this item
        const { data: existing } = await sb.from('carts')
          .select('*')
          .eq('user_id', userId)
          .eq('plant_id', item.plant_id)
          .eq('variety_idx', item.variety_idx)
          .maybeSingle();

        if (existing) {
          // Merge quantities
          await sb.from('carts')
            .update({ qty: existing.qty + item.qty, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          // Move guest item to user
          await sb.from('carts')
            .update({ user_id: userId, session_id: null })
            .eq('id', item.id);
        }
      }

      // Clean up any remaining guest items
      await sb.from('carts').delete().eq('session_id', sessionId);

    } catch (e) {
      console.error('Cart merge error:', e);
    }
  }

  return { getAll, addItem, updateQty, removeItem, clearCart, mergeGuestCart, getSessionId };
})();