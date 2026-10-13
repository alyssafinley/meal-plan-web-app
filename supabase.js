window.OurTableSupabase = (() => {
  const SUPABASE_URL = 'https://agqpwjhtbxytllbnpgbo.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_xjnPDwRl5MX7NT2IqvhvJw_juF6zzEo';
  const DEFAULT_PLAN_ID = 'family-default';

  let client = null;

  async function ensureClient() {
    if (client) return client;

    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  function fallbackLoadRecipesLocal() {
    const saved = localStorage.getItem('ourTableRecipes');
    if (saved) return JSON.parse(saved);
    const defaults = typeof window.defaultRecipes !== 'undefined' ? window.defaultRecipes : [];
    localStorage.setItem('ourTableRecipes', JSON.stringify(defaults));
    return defaults;
  }

  function fallbackSaveRecipesLocal(recipes) {
    localStorage.setItem('ourTableRecipes', JSON.stringify(recipes));
  }

  function fallbackLoadWeekLocal() {
    const saved = localStorage.getItem('ourTableWeek');
    if (saved) return JSON.parse(saved);
    const defaults = typeof window.defaultWeek !== 'undefined' ? window.defaultWeek : {};
    localStorage.setItem('ourTableWeek', JSON.stringify(defaults));
    return { ...defaults };
  }

  function fallbackSaveWeekLocal(week) {
    localStorage.setItem('ourTableWeek', JSON.stringify(week));
  }

  function normalizeRecipeRecipe(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      time: row.time || '',
      servings: row.servings || '',
      ingredients: row.ingredients || [],
      directions: row.directions || []
    };
  }

  async function fetchRecipesFromSupabase() {
    const supabase = await ensureClient();
    const { data, error } = await supabase.from('recipes').select('*');
    if (error) throw error;
    if (!data || data.length === 0) {
      const defaults = typeof window.defaultRecipes !== 'undefined' ? window.defaultRecipes : [];
      if (defaults.length) {
        const upload = defaults.map((recipe) => ({ ...recipe }));
        await supabase.from('recipes').upsert(upload);
        return upload;
      }
      return [];
    }
    return data.map(normalizeRecipeRecipe);
  }

  async function saveRecipesToSupabase(recipes) {
    const supabase = await ensureClient();
    const rows = recipes.map((recipe) => ({ ...recipe }));
    const { data, error } = await supabase.from('recipes').upsert(rows);
    if (error) throw error;
    return data || rows;
  }

  async function fetchWeekFromSupabase() {
    const supabase = await ensureClient();
    const { data, error } = await supabase
      .from('plans')
      .select('assignments')
      .eq('id', DEFAULT_PLAN_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (error && error.code === 'PGRST116') {
      const defaults = typeof window.defaultWeek !== 'undefined' ? window.defaultWeek : {};
      await supabase.from('plans').upsert([{ id: DEFAULT_PLAN_ID, name: 'Default plan', assignments: defaults }]);
      return { ...defaults };
    }

    return data?.assignments || (typeof window.defaultWeek !== 'undefined' ? { ...window.defaultWeek } : {});
  }

  async function saveWeekToSupabase(week) {
    const supabase = await ensureClient();
    const { data, error } = await supabase
      .from('plans')
      .upsert([{ id: DEFAULT_PLAN_ID, name: 'Default plan', assignments: week }]);

    if (error) throw error;
    return data || week;
  }

  function slugify(value) {
    return String(value || 'recipe')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'recipe';
  }

  function buildManualRecipe(url, name) {
    return {
      id: `${slugify(name)}-${Date.now()}`,
      name,
      description: '',
      time: '',
      servings: '',
      ingredients: [],
      directions: [],
      sourceUrl: url
    };
  }

  function buildPromptRecipe(url) {
    const name = prompt('Recipe name', 'New recipe');
    if (!name) return null;

    const time = prompt('Cook time (optional)', '');
    const servings = prompt('Servings (optional)', '');
    const ingredientsRaw = prompt('Ingredients (one per line)', '');
    const directionsRaw = prompt('Direction steps (one per line)', '');

    const ingredients = (ingredientsRaw || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [line, '']);

    const directions = (directionsRaw || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ['Step', line]);

    return {
      id: `${slugify(name)}-${Date.now()}`,
      name,
      description: '',
      time: time || '',
      servings: servings || '',
      ingredients,
      directions,
      sourceUrl: url
    };
  }

  async function loadRecipes() {
    try {
      return await fetchRecipesFromSupabase();
    } catch (err) {
      console.warn('Supabase recipes fetch failed, falling back to localStorage:', err);
      return fallbackLoadRecipesLocal();
    }
  }

  async function saveRecipes(recipes) {
    try {
      return await saveRecipesToSupabase(recipes);
    } catch (err) {
      console.warn('Supabase recipe save failed, falling back to localStorage:', err);
      fallbackSaveRecipesLocal(recipes);
      return recipes;
    }
  }

  async function loadWeek() {
    try {
      return await fetchWeekFromSupabase();
    } catch (err) {
      console.warn('Supabase week fetch failed, falling back to localStorage:', err);
      return fallbackLoadWeekLocal();
    }
  }

  async function saveWeek(week) {
    try {
      return await saveWeekToSupabase(week);
    } catch (err) {
      console.warn('Supabase week save failed, falling back to localStorage:', err);
      fallbackSaveWeekLocal(week);
      return week;
    }
  }

  async function importRecipe() {
    const input = document.getElementById('recipeUrl');
    const url = (input && input.value ? input.value.trim() : '');

    if (!url) {
      alert('Please paste a recipe URL first.');
      return;
    }

    try {
      // No extractor is configured yet, so this falls back to a manual recipe record.
      const recipe = buildPromptRecipe(url);
      if (!recipe) return;

      const currentRecipes = (await loadRecipes()) || [];
      const updatedRecipes = [...currentRecipes, recipe];
      await saveRecipes(updatedRecipes);

      const currentWeek = await loadWeek();
      if (!currentWeek || typeof currentWeek !== 'object') {
        await saveWeek({});
      }

      if (input) input.value = '';
      if (typeof renderAll === 'function') renderAll();
      if (typeof showView === 'function') showView('recipes');
      alert('Recipe saved to shared Supabase data.');
    } catch (err) {
      console.error('Recipe import failed:', err);
      alert('Recipe import failed. Please try again.');
    }
  }

  async function initData() {
    try {
      const recipes = await loadRecipes();
      const week = await loadWeek();

      if (typeof setAppData === 'function') {
        setAppData({ recipes, week });
      }

      if (typeof renderAll === 'function') {
        renderAll();
      }
    } catch (err) {
      console.error('Supabase initData failed:', err);
    }
  }

  window.loadRecipes = loadRecipes;
  window.saveRecipes = saveRecipes;
  window.loadWeek = loadWeek;
  window.saveWeek = saveWeek;
  window.importRecipe = importRecipe;
  window.initData = initData;

  return {
    ensureClient,
    loadRecipes,
    saveRecipes,
    loadWeek,
    saveWeek,
    importRecipe,
    initData
  };
})();

window.addEventListener('load', () => {
  if (window.initData) {
    window.initData();
  }
});
