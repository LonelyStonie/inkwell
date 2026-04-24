import { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  BookOpen, Plus, Search, ChevronDown, Sun, Moon, Type, X, PenSquare, ArrowLeft, Calendar,
  User, Loader2, Upload, Image as ImageIcon, LogIn, LogOut, UserPlus,
  Shield, Users, Crown, UserCog, Eye, Star, Menu, Edit, FolderPlus, Tag, Trash2,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// =====================================================
// AUTH CONTEXT
// =====================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('inkwell_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => { localStorage.removeItem('inkwell_token'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  const login = (newToken, newUser) => {
    localStorage.setItem('inkwell_token', newToken);
    setToken(newToken); setUser(newUser);
  };
  const logout = () => {
    localStorage.removeItem('inkwell_token');
    setToken(null); setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

// =====================================================
// API HELPER
// =====================================================
function useApi() {
  const { token, logout } = useAuth();

  const authedFetch = async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(url, { ...options, headers });
    if (r.status === 401) { logout(); throw new Error('Session expired. Please log in again.'); }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${r.status})`);
    }
    return r.json();
  };

  return {
    listStories: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null && v !== '')).toString();
      return fetch(`${API_URL}/api/stories${qs ? '?' + qs : ''}`).then(r => r.json());
    },
    getStory: (id) => fetch(`${API_URL}/api/stories/${id}`).then(r => r.ok ? r.json() : Promise.reject()),
    incrementView: (id) => fetch(`${API_URL}/api/stories/${id}/view`, { method: 'POST' }),
    createStory: (formData) => authedFetch(`${API_URL}/api/stories`, { method: 'POST', body: formData }),
    updateStory: (id, data) => authedFetch(`${API_URL}/api/stories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    deleteStory: (id) => authedFetch(`${API_URL}/api/stories/${id}`, { method: 'DELETE' }),
    updateBanner: (id, file) => {
      const fd = new FormData(); fd.append('banner', file);
      return authedFetch(`${API_URL}/api/stories/${id}/banner`, { method: 'PUT', body: fd });
    },
    removeBanner: (id) => authedFetch(`${API_URL}/api/stories/${id}/banner`, { method: 'DELETE' }),
    listCategories: () => fetch(`${API_URL}/api/categories`).then(r => r.json()),
    createCategory: (data) => authedFetch(`${API_URL}/api/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    updateCategory: (id, data) => authedFetch(`${API_URL}/api/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    deleteCategory: (id) => authedFetch(`${API_URL}/api/categories/${id}`, { method: 'DELETE' }),
    createSubcategory: (data) => authedFetch(`${API_URL}/api/subcategories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    updateSubcategory: (id, data) => authedFetch(`${API_URL}/api/subcategories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    deleteSubcategory: (id) => authedFetch(`${API_URL}/api/subcategories/${id}`, { method: 'DELETE' }),
    getStats: () => authedFetch(`${API_URL}/api/admin/stats`),
    listUsers: () => authedFetch(`${API_URL}/api/admin/users`),
    updateUserRole: (id, role) => authedFetch(`${API_URL}/api/admin/users/${id}/role`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    }),
    deleteUser: (id) => authedFetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE' }),
  };
}

// =====================================================
// MAIN APP
// =====================================================
export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}

function AppInner() {
  const { loading: authLoading } = useAuth();
  const [view, setView] = useState('home');
  const [currentStory, setCurrentStory] = useState(null);
  const [currentFilter, setCurrentFilter] = useState({ category: null, subcategory: null });
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [toast, setToast] = useState(null);

  const api = useApi();

  useEffect(() => { if (!authLoading) loadInitial(); }, [authLoading]);

  const loadInitial = async () => {
    try {
      const [storiesData, categoriesData] = await Promise.all([
        api.listStories(),
        api.listCategories(),
      ]);
      setStories(storiesData);
      setCategories(categoriesData);
    } catch (e) { showToast('Could not load data', 'error'); }
    setLoading(false);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const reloadStories = async (filter = currentFilter) => {
    try {
      const params = {};
      if (filter?.category) params.category = filter.category;
      if (filter?.subcategory) params.subcategory = filter.subcategory;
      const data = await api.listStories(params);
      setStories(data);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const reloadCategories = async () => {
    try { setCategories(await api.listCategories()); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const openStory = async (id) => {
    try {
      const data = await api.getStory(id);
      setCurrentStory(data);
      setView('story');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      api.incrementView(id).catch(() => {});
    } catch (e) { showToast('Could not load story', 'error'); }
  };

  const goHome = (filter = { category: null, subcategory: null }) => {
    setCurrentFilter(filter);
    setView('home');
    setSearchQuery('');
    reloadStories(filter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateStory = async (data) => {
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (k === 'bannerFile') { if (v) fd.append('banner', v); }
        else if (v != null && v !== '') fd.append(k, v);
      });
      await api.createStory(fd);
      await reloadStories();
      setShowCreateModal(false);
      showToast('Story published!');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleUpdateStory = async (data) => {
    try {
      await api.updateStory(editingStory.id, data);
      await reloadStories();
      if (currentStory?.id === editingStory.id) {
        setCurrentStory(await api.getStory(editingStory.id));
      }
      setEditingStory(null);
      showToast('Story updated!');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDeleteStory = async (storyId) => {
    if (!confirm('Delete this story? This cannot be undone.')) return;
    try {
      await api.deleteStory(storyId);
      await reloadStories();
      if (currentStory?.id === storyId) { setCurrentStory(null); setView('home'); }
      showToast('Story deleted');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleUpdateBanner = async (file) => {
    try {
      if (file === null) { await api.removeBanner(currentStory.id); showToast('Banner removed'); }
      else { await api.updateBanner(currentStory.id, file); showToast('Banner updated!'); }
      setCurrentStory(await api.getStory(currentStory.id));
      await reloadStories();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const filteredStories = stories.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q);
  });

  if (authLoading || loading) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-700 animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <Header
        categories={categories}
        currentFilter={currentFilter}
        onNavigate={goHome}
        onGoAdmin={() => { setView('admin'); window.scrollTo(0, 0); }}
        onPublish={() => setShowCreateModal(true)}
        onShowAuth={(mode) => { setAuthMode(mode); setShowAuthModal(true); }}
        showToast={showToast}
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === 'home' && (
          <HomeView
            stories={filteredStories}
            totalStories={stories.length}
            currentFilter={currentFilter}
            categories={categories}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onNavigate={goHome}
            onSelectStory={openStory}
            onCreateNew={() => setShowCreateModal(true)}
          />
        )}
        {view === 'story' && currentStory && (
          <StoryDetailView
            story={currentStory}
            allStories={stories}
            categories={categories}
            onBack={() => goHome(currentFilter)}
            onSelectStory={openStory}
            onEdit={() => setEditingStory(currentStory)}
            onUpdateBanner={handleUpdateBanner}
            onDelete={() => handleDeleteStory(currentStory.id)}
          />
        )}
        {view === 'admin' && (
          <AdminDashboard
            onBack={() => goHome()}
            showToast={showToast}
            categories={categories}
            reloadCategories={reloadCategories}
          />
        )}
      </main>

      {showCreateModal && (
        <StoryEditorModal
          mode="create" categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateStory}
        />
      )}
      {editingStory && (
        <StoryEditorModal
          mode="edit" story={editingStory} categories={categories}
          onClose={() => setEditingStory(null)}
          onSubmit={handleUpdateStory}
        />
      )}
      {showAuthModal && (
        <AuthModal mode={authMode} setMode={setAuthMode}
          onClose={() => setShowAuthModal(false)} showToast={showToast} />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl text-white font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}

      <footer className="border-t border-stone-200 mt-12 py-6 text-center text-sm text-stone-500">
        <p>TheTaleDistrict — Share your stories with the world</p>
      </footer>
    </div>
  );
}

// =====================================================
// HEADER with dropdown navigation + mobile hamburger
// =====================================================
function Header({ categories, currentFilter, onNavigate, onGoAdmin, onPublish, onShowAuth, showToast }) {
  const { user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  return (
    <header className="bg-gradient-to-r from-amber-900 via-amber-800 to-orange-900 text-amber-50 shadow-lg sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate()} className="flex items-center gap-2 hover:opacity-80 transition">
          <BookOpen className="w-7 h-7" />
          <div className="text-left">
            <h1 className="text-xl font-bold tracking-tight">TheTaleDistrict</h1>
            <p className="text-xs text-amber-200/80 -mt-0.5 hidden sm:block">Where every tale finds a home</p>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          <button onClick={() => onNavigate()}
            className={`px-3 py-2 text-sm rounded-lg hover:bg-amber-800/50 ${!currentFilter.category ? 'bg-amber-800/40 font-semibold' : ''}`}>
            Home
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="relative"
              onMouseEnter={() => setOpenDropdown(cat.id)}
              onMouseLeave={() => setOpenDropdown(null)}>
              <button onClick={() => onNavigate({ category: cat.slug, subcategory: null })}
                className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg hover:bg-amber-800/50 ${currentFilter.category === cat.slug ? 'bg-amber-800/40 font-semibold' : ''}`}>
                {cat.name}
                {cat.subcategories.length > 0 && <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {openDropdown === cat.id && cat.subcategories.length > 0 && (
                <div className="absolute top-full left-0 pt-2 min-w-[200px] z-40">
                  <div className="bg-white rounded-xl shadow-2xl border border-stone-200 py-2">
                    <button onClick={() => { onNavigate({ category: cat.slug, subcategory: null }); setOpenDropdown(null); }}
                      className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-amber-50 font-medium">
                      All {cat.name}
                    </button>
                    <div className="border-t border-stone-100 my-1"></div>
                    {cat.subcategories.map(sub => (
                      <button key={sub.id}
                        onClick={() => { onNavigate({ category: cat.slug, subcategory: sub.slug }); setOpenDropdown(null); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 ${currentFilter.subcategory === sub.slug ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-stone-700'}`}>
                        {sub.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={onPublish}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 hover:bg-white transition text-sm font-semibold">
              <PenSquare className="w-4 h-4" /><span>Publish</span>
            </button>
          )}

          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-800/50">
                <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-900 flex items-center justify-center font-bold text-sm">
                  {user.username[0].toUpperCase()}
                </div>
                {isAdmin && <Crown className="w-3.5 h-3.5 text-yellow-300" />}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-2xl border border-stone-200 py-2 z-20">
                    <div className="px-4 py-2 border-b border-stone-100">
                      <p className="text-xs text-stone-500">Signed in as</p>
                      <p className="text-stone-800 font-semibold text-sm">{user.username}</p>
                      <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                        {isAdmin ? <><Crown className="w-3 h-3" /> Administrator</> : <><User className="w-3 h-3" /> Reader</>}
                      </p>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { onGoAdmin(); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm text-stone-700">
                        <Shield className="w-4 h-4" /> Admin Dashboard
                      </button>
                    )}
                    <button onClick={() => { logout(); setMenuOpen(false); showToast('Signed out'); }}
                      className="w-full text-left px-4 py-2 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 text-sm text-stone-700">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button onClick={() => onShowAuth('login')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-amber-800/50 text-sm">
                <LogIn className="w-4 h-4" /> Sign in
              </button>
              <button onClick={() => onShowAuth('register')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 hover:bg-white text-sm font-semibold">
                <UserPlus className="w-4 h-4" /> Sign up
              </button>
            </>
          )}

          <button onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-amber-800/50">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <MobileMenu
          categories={categories}
          currentFilter={currentFilter}
          onNavigate={(f) => { onNavigate(f); setMobileOpen(false); }}
          onClose={() => setMobileOpen(false)}
          onPublish={() => { onPublish(); setMobileOpen(false); }}
          onShowAuth={(m) => { onShowAuth(m); setMobileOpen(false); }}
          onGoAdmin={() => { onGoAdmin(); setMobileOpen(false); }}
        />
      )}
    </header>
  );
}

function MobileMenu({ categories, currentFilter, onNavigate, onClose, onPublish, onShowAuth, onGoAdmin }) {
  const { user, isAdmin, logout } = useAuth();
  const [expandedCat, setExpandedCat] = useState(null);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl overflow-y-auto">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <h3 className="font-bold text-stone-800">Menu</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        {user && (
          <div className="p-4 bg-amber-50 border-b border-stone-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-800 text-amber-50 flex items-center justify-center font-bold">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-stone-800">{user.username}</p>
              <p className="text-xs text-amber-700 flex items-center gap-1">
                {isAdmin ? <><Crown className="w-3 h-3" /> Administrator</> : <><User className="w-3 h-3" /> Reader</>}
              </p>
            </div>
          </div>
        )}

        <div className="py-2">
          <button onClick={() => onNavigate()}
            className={`w-full text-left px-4 py-3 text-sm hover:bg-amber-50 ${!currentFilter.category ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-stone-700'}`}>
            🏠 Home
          </button>
          {categories.map(cat => (
            <div key={cat.id}>
              <button onClick={() => setExpandedCat(e => e === cat.id ? null : cat.id)}
                className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-amber-50 ${currentFilter.category === cat.slug ? 'text-amber-800 font-semibold' : 'text-stone-700'}`}>
                <span>{cat.name}</span>
                {cat.subcategories.length > 0 && <ChevronDown className={`w-4 h-4 transition ${expandedCat === cat.id ? 'rotate-180' : ''}`} />}
              </button>
              {expandedCat === cat.id && (
                <div className="bg-stone-50">
                  <button onClick={() => onNavigate({ category: cat.slug, subcategory: null })}
                    className="w-full text-left pl-8 pr-4 py-2 text-sm text-stone-600 hover:bg-amber-50">
                    All {cat.name}
                  </button>
                  {cat.subcategories.map(sub => (
                    <button key={sub.id} onClick={() => onNavigate({ category: cat.slug, subcategory: sub.slug })}
                      className={`w-full text-left pl-8 pr-4 py-2 text-sm hover:bg-amber-50 ${currentFilter.subcategory === sub.slug ? 'text-amber-800 font-semibold' : 'text-stone-600'}`}>
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-stone-200 py-2">
          {isAdmin && (
            <>
              <button onClick={onPublish}
                className="w-full text-left px-4 py-3 text-sm hover:bg-amber-50 text-stone-700 flex items-center gap-2">
                <PenSquare className="w-4 h-4 text-amber-700" /> Publish story
              </button>
              <button onClick={onGoAdmin}
                className="w-full text-left px-4 py-3 text-sm hover:bg-amber-50 text-stone-700 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-700" /> Admin Dashboard
              </button>
            </>
          )}
          {user ? (
            <button onClick={() => { logout(); onClose(); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 text-red-700 flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          ) : (
            <>
              <button onClick={() => onShowAuth('login')}
                className="w-full text-left px-4 py-3 text-sm hover:bg-amber-50 text-stone-700 flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Sign in
              </button>
              <button onClick={() => onShowAuth('register')}
                className="w-full text-left px-4 py-3 text-sm hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// HOME VIEW
// =====================================================
function HomeView({ stories, totalStories, currentFilter, categories, searchQuery, setSearchQuery, onNavigate, onSelectStory, onCreateNew }) {
  const { isAdmin } = useAuth();

  const currentCat = currentFilter.category ? categories.find(c => c.slug === currentFilter.category) : null;
  const currentSub = currentCat && currentFilter.subcategory
    ? currentCat.subcategories.find(s => s.slug === currentFilter.subcategory) : null;

  const heading = currentSub ? currentSub.name : (currentCat ? currentCat.name : 'Discover endless stories');
  const subheading = currentSub
    ? `Browse ${currentSub.name} stories in ${currentCat.name}`
    : currentCat
      ? `All ${currentCat.name} stories`
      : 'Curated tales from passionate writers — your next great read is waiting';

  return (
    <div>
      <div className="mb-8 text-center py-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-stone-800 mb-2" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          {heading}
        </h2>
        <p className="text-stone-600">{subheading}</p>
      </div>

      <div className="mb-4 relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by title or author..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-700" />
      </div>

      {/* Category pills */}
      <div className="mb-3 flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => onNavigate()}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
            !currentFilter.category
              ? 'bg-amber-800 text-white shadow-md'
              : 'bg-white text-stone-700 hover:bg-amber-50 border border-stone-200'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onNavigate({ category: cat.slug, subcategory: null })}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              currentFilter.category === cat.slug
                ? 'bg-amber-800 text-white shadow-md'
                : 'bg-white text-stone-700 hover:bg-amber-50 border border-stone-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Subcategory pills — only show when a category is selected */}
      {currentCat && currentCat.subcategories.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => onNavigate({ category: currentCat.slug, subcategory: null })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              !currentFilter.subcategory
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-stone-50 text-stone-600 hover:bg-amber-50 border border-stone-200'
            }`}
          >
            All {currentCat.name}
          </button>
          {currentCat.subcategories.map(sub => (
            <button
              key={sub.id}
              onClick={() => onNavigate({ category: currentCat.slug, subcategory: sub.slug })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                currentFilter.subcategory === sub.slug
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-stone-50 text-stone-600 hover:bg-amber-50 border border-stone-200'
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      {/* Spacer when no subcategory row */}
      {!currentCat && <div className="mb-8"></div>}

      {stories.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-stone-300">
          {totalStories === 0 ? (
            <>
              <BookOpen className="w-16 h-16 text-stone-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-stone-700 mb-2">No stories yet</h3>
              {isAdmin ? (
                <>
                  <p className="text-stone-500 mb-5">Be the first to publish a story on the platform!</p>
                  <button onClick={onCreateNew} className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-800 text-white rounded-xl hover:bg-amber-900 font-semibold">
                    <Plus className="w-5 h-5" /> Publish first story
                  </button>
                </>
              ) : (
                <p className="text-stone-500">Stories will appear here soon. Check back later!</p>
              )}
            </>
          ) : (
            <><Search className="w-12 h-12 text-stone-300 mx-auto mb-3" /><p className="text-stone-500">No stories match your search</p></>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {stories.map(story => <StoryCard key={story.id} story={story} onClick={() => onSelectStory(story.id)} />)}
        </div>
      )}
    </div>
  );
}

function StoryCard({ story, onClick, size = 'normal' }) {
  const isCompact = size === 'compact';
  return (
    <button onClick={onClick}
      className={`group text-left bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-stone-200 flex ${isCompact ? 'flex-row items-stretch' : 'flex-col'}`}>
      <div className={`relative overflow-hidden ${story.bannerUrl ? 'bg-stone-200' : `bg-gradient-to-br ${story.coverColor}`} ${isCompact ? 'w-24 flex-shrink-0' : 'aspect-[16/9]'}`}>
        {story.bannerUrl ? (
          <img src={story.bannerUrl} alt={story.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <BookOpen className={`text-white/40 ${isCompact ? 'w-6 h-6' : 'w-10 h-10'}`} />
          </div>
        )}
        {story.featured && !isCompact && (
          <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
            <Star className="w-3 h-3 fill-white" /> FEATURED
          </div>
        )}
      </div>
      <div className={`flex-1 ${isCompact ? 'p-3' : 'p-4'}`}>
        {story.subcategory && !isCompact && (
          <span className="inline-block text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 rounded-full font-medium mb-2">
            {story.subcategory.name}
          </span>
        )}
        <h4 className={`font-semibold text-stone-800 group-hover:text-amber-800 ${isCompact ? 'text-sm line-clamp-2' : 'text-base line-clamp-2'}`} style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          {story.title}
        </h4>
        <p className={`text-stone-500 mt-1 line-clamp-1 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
          by {story.author}
        </p>
        {!isCompact && story.excerpt && (
          <p className="text-xs text-stone-600 mt-2 line-clamp-2">{story.excerpt}</p>
        )}
        <div className={`flex items-center gap-3 mt-2 text-stone-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {story.views}</span>
          <span>•</span>
          <span>{new Date(story.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </button>
  );
}

// =====================================================
// STORY DETAIL VIEW
// =====================================================
function StoryDetailView({ story, allStories, categories, onBack, onSelectStory, onEdit, onUpdateBanner, onDelete }) {
  const { isAdmin } = useAuth();
  const [editingBanner, setEditingBanner] = useState(false);
  const [readerTheme, setReaderTheme] = useState('sepia');
  const [fontSize, setFontSize] = useState(18);

  const popular = [...allStories].filter(s => s.id !== story.id).sort((a, b) => b.views - a.views).slice(0, 5);
  const latest = [...allStories].filter(s => s.id !== story.id).slice(0, 5);
  const allTags = categories.flatMap(c => c.subcategories);

  const themes = {
    light: 'bg-white text-stone-900',
    sepia: 'bg-amber-50 text-stone-800',
    dark: 'bg-stone-900 text-stone-100',
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-stone-600 hover:text-amber-800 mb-5 transition">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
      </button>

      {story.bannerUrl && (
        <div className="relative -mx-4 sm:mx-0 mb-6 overflow-hidden sm:rounded-2xl" style={{ maxHeight: '500px' }}>
          <img src={story.bannerUrl} alt={story.title}
            className="w-full h-auto object-cover" style={{ maxHeight: '500px' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none"></div>
          {story.featured && (
            <div className="absolute top-4 left-4 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
              <Star className="w-3.5 h-3.5 fill-white" /> FEATURED
            </div>
          )}
          {isAdmin && (
            <button onClick={() => setEditingBanner(true)}
              className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" /> Change banner
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
        <article className={`${themes[readerTheme]} rounded-2xl p-6 sm:p-10 shadow-sm transition-colors min-w-0 overflow-hidden`}>
          {story.category && (
            <div className="text-sm mb-3 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-amber-700">{story.category.name}</span>
              {story.subcategory && (
                <>
                  <span className="opacity-40">/</span>
                  <span className="font-medium text-amber-700">{story.subcategory.name}</span>
                </>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-current/10 flex-wrap">
              <button onClick={onEdit}
                className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 text-xs font-medium flex items-center gap-1.5 border border-amber-200">
                <Edit className="w-3.5 h-3.5" /> Edit
              </button>
              {!story.bannerUrl && (
                <button onClick={() => setEditingBanner(true)}
                  className="px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 text-xs font-medium flex items-center gap-1.5 border border-stone-200">
                  <ImageIcon className="w-3.5 h-3.5" /> Add banner
                </button>
              )}
              <button onClick={onDelete}
                className="ml-auto px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-xs font-medium flex items-center gap-1.5 border border-red-200">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}

          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight"
            style={{ fontFamily: 'ui-serif, Georgia, serif', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {story.title}
          </h1>

          <div className="flex flex-wrap gap-4 text-sm opacity-70 mb-6">
            <div className="flex items-center gap-1.5"><User className="w-4 h-4" /> {story.author}</div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> {story.views} views</div>
          </div>

          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-current/10 flex-wrap">
            <div className="flex items-center rounded-lg border border-current/20 overflow-hidden">
              <button onClick={() => setReaderTheme('light')}
                className={`p-1.5 ${readerTheme === 'light' ? 'bg-amber-700 text-white' : ''}`}><Sun className="w-4 h-4" /></button>
              <button onClick={() => setReaderTheme('sepia')}
                className={`p-1.5 ${readerTheme === 'sepia' ? 'bg-amber-700 text-white' : ''}`}><BookOpen className="w-4 h-4" /></button>
              <button onClick={() => setReaderTheme('dark')}
                className={`p-1.5 ${readerTheme === 'dark' ? 'bg-amber-700 text-white' : ''}`}><Moon className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-current/20 px-2 py-1">
              <button onClick={() => setFontSize(s => Math.max(14, s - 1))} className="px-1">A-</button>
              <Type className="w-3 h-3 opacity-50" />
              <button onClick={() => setFontSize(s => Math.min(28, s + 1))} className="px-1">A+</button>
            </div>
          </div>

          {story.excerpt && (
            <p className="text-lg italic opacity-80 mb-6 pl-4 border-l-4 border-amber-600"
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {story.excerpt}
            </p>
          )}

          <div className="whitespace-pre-wrap leading-relaxed"
            style={{
              fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
              fontSize: `${fontSize}px`, lineHeight: 1.8,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>
            {story.content || <em className="opacity-60">No content yet.</em>}
          </div>
        </article>

        <aside className="space-y-6">
          {popular.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">🔥 Popular Stories</h3>
              <div className="space-y-3">
                {popular.map(s => (
                  <StoryCard key={s.id} story={s} onClick={() => onSelectStory(s.id)} size="compact" />
                ))}
              </div>
            </div>
          )}

          {latest.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">⏰ Latest Stories</h3>
              <div className="space-y-3">
                {latest.map(s => (
                  <StoryCard key={s.id} story={s} onClick={() => onSelectStory(s.id)} size="compact" />
                ))}
              </div>
            </div>
          )}

          {allTags.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">🏷️ Tags</h3>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <span key={tag.id}
                    className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded-full">
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {editingBanner && isAdmin && (
        <BannerEditModal currentBannerUrl={story.bannerUrl}
          onClose={() => setEditingBanner(false)}
          onSave={async (f) => { await onUpdateBanner(f); setEditingBanner(false); }}
          onRemove={async () => { await onUpdateBanner(null); setEditingBanner(false); }} />
      )}
    </div>
  );
}

// =====================================================
// ADMIN DASHBOARD
// =====================================================
function AdminDashboard({ onBack, showToast, categories, reloadCategories }) {
  const [tab, setTab] = useState('overview');
  const api = useApi();
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [s, u] = await Promise.all([api.getStats(), api.listUsers()]);
      setStats(s); setUsers(u);
    } catch (e) { showToast(e.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 text-amber-700 animate-spin" /></div>;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-stone-600 hover:text-amber-800 mb-5 transition">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back</span>
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-amber-800" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-800" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>Admin Dashboard</h1>
          <p className="text-sm text-stone-500">Manage users, categories, and platform overview</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: Users },
          { id: 'users', label: 'Users', icon: UserCog },
          { id: 'categories', label: 'Categories', icon: Tag },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition whitespace-nowrap ${tab === t.id ? 'border-amber-700 text-amber-800' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Users" value={stats.totalUsers} color="text-blue-700 bg-blue-50" />
          <StatCard icon={Crown} label="Admins" value={stats.totalAdmins} color="text-amber-700 bg-amber-50" />
          <StatCard icon={BookOpen} label="Stories" value={stats.totalStories} color="text-emerald-700 bg-emerald-50" />
          <StatCard icon={Tag} label="Categories" value={categories.length} color="text-purple-700 bg-purple-50" />
        </div>
      )}

      {tab === 'users' && (
        <UsersTable users={users} currentUser={currentUser} api={api} showToast={showToast} reload={load} />
      )}

      {tab === 'categories' && (
        <CategoriesManager categories={categories} api={api} showToast={showToast} reload={reloadCategories} />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-stone-200">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-stone-800">{value}</p>
      <p className="text-xs text-stone-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function UsersTable({ users, currentUser, api, showToast, reload }) {
  const handleRoleChange = async (id, role) => {
    try { await api.updateUserRole(id, role); await reload(); showToast(`User role updated to ${role}`); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const handleDelete = async (u) => {
    if (!confirm(`Delete "${u.username}" and all their stories?`)) return;
    try { await api.deleteUser(u.id); await reload(); showToast('User deleted'); }
    catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200 flex items-center gap-2">
        <UserCog className="w-5 h-5 text-stone-600" />
        <h2 className="font-bold text-lg text-stone-800">User Management</h2>
        <span className="ml-auto text-sm text-stone-500">{users.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Stories</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                      {u.username[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-stone-800">{u.username}</p>
                      {u.id === currentUser.id && <p className="text-[11px] text-emerald-700">(you)</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'admin' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                      <Crown className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-medium">
                      <User className="w-3 h-3" /> User
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600 hidden sm:table-cell">{u.storyCount}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser.id && (
                    <div className="flex items-center justify-end gap-1.5">
                      {u.role === 'user' ? (
                        <button onClick={() => handleRoleChange(u.id, 'admin')}
                          className="px-2.5 py-1 text-xs bg-amber-50 text-amber-800 rounded hover:bg-amber-100 font-medium">Promote</button>
                      ) : (
                        <button onClick={() => handleRoleChange(u.id, 'user')}
                          className="px-2.5 py-1 text-xs bg-stone-100 text-stone-700 rounded hover:bg-stone-200 font-medium">Demote</button>
                      )}
                      <button onClick={() => handleDelete(u)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoriesManager({ categories, api, showToast, reload }) {
  const [showAddCat, setShowAddCat] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [addingSubTo, setAddingSubTo] = useState(null);
  const [editingSub, setEditingSub] = useState(null);

  const handleDeleteCat = async (cat) => {
    if (!confirm(`Delete category "${cat.name}"?\n\nAll subcategories and stories assigned will be affected.`)) return;
    try { await api.deleteCategory(cat.id); await reload(); showToast('Category deleted'); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const handleDeleteSub = async (sub) => {
    if (!confirm(`Delete tag "${sub.name}"?`)) return;
    try { await api.deleteSubcategory(sub.id); await reload(); showToast('Tag deleted'); }
    catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center gap-2 flex-wrap">
          <Tag className="w-5 h-5 text-stone-600" />
          <h2 className="font-bold text-lg text-stone-800">Categories & Tags</h2>
          <button onClick={() => setShowAddCat(true)}
            className="ml-auto px-3 py-1.5 bg-amber-800 text-white rounded-lg hover:bg-amber-900 text-sm font-medium flex items-center gap-1.5">
            <FolderPlus className="w-4 h-4" /> New Category
          </button>
        </div>

        <div className="divide-y divide-stone-100">
          {categories.map(cat => (
            <div key={cat.id} className="p-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-800">{cat.name}</h3>
                    <span className="text-xs text-stone-400">/{cat.slug}</span>
                  </div>
                  <p className="text-xs text-stone-500">{cat.subcategories.length} tag{cat.subcategories.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setAddingSubTo(cat)}
                  className="px-2.5 py-1 text-xs bg-amber-50 text-amber-800 rounded hover:bg-amber-100 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Tag
                </button>
                <button onClick={() => setEditingCat(cat)}
                  className="p-1.5 text-stone-600 hover:bg-stone-100 rounded"><Edit className="w-4 h-4" /></button>
                <button onClick={() => handleDeleteCat(cat)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>

              {cat.subcategories.length > 0 && (
                <div className="pl-4 border-l-2 border-stone-200 space-y-2">
                  {cat.subcategories.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 py-1.5">
                      <Tag className="w-3.5 h-3.5 text-stone-400" />
                      <div className="flex-1">
                        <span className="text-sm text-stone-700 font-medium">{sub.name}</span>
                        <span className="ml-2 text-xs text-stone-400">/{sub.slug}</span>
                      </div>
                      <button onClick={() => setEditingSub({ ...sub, categoryId: cat.id })}
                        className="p-1 text-stone-500 hover:bg-stone-100 rounded"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteSub(sub)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {categories.length === 0 && (
            <div className="py-12 text-center text-stone-400">
              <Tag className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No categories yet</p>
            </div>
          )}
        </div>
      </div>

      {(showAddCat || editingCat) && (
        <CategoryFormModal
          category={editingCat}
          onClose={() => { setShowAddCat(false); setEditingCat(null); }}
          onSubmit={async (data) => {
            try {
              if (editingCat) { await api.updateCategory(editingCat.id, data); showToast('Category updated'); }
              else { await api.createCategory(data); showToast('Category created'); }
              await reload();
              setShowAddCat(false); setEditingCat(null);
            } catch (e) { showToast(e.message, 'error'); }
          }}
        />
      )}

      {(addingSubTo || editingSub) && (
        <SubcategoryFormModal
          subcategory={editingSub}
          categoryName={addingSubTo?.name || categories.find(c => c.id === editingSub?.categoryId)?.name}
          onClose={() => { setAddingSubTo(null); setEditingSub(null); }}
          onSubmit={async (data) => {
            try {
              if (editingSub) { await api.updateSubcategory(editingSub.id, data); showToast('Tag updated'); }
              else { await api.createSubcategory({ ...data, categoryId: addingSubTo.id }); showToast('Tag created'); }
              await reload();
              setAddingSubTo(null); setEditingSub(null);
            } catch (e) { showToast(e.message, 'error'); }
          }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, onClose, onSubmit }) {
  const [name, setName] = useState(category?.name || '');
  const [order, setOrder] = useState(category?.display_order ?? 0);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-amber-700" /> {category ? 'Edit category' : 'New category'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Name</label>
            <input type="text" value={name} autoFocus onChange={e => setName(e.target.value)}
              placeholder="e.g. Lifestyle"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Display order (optional)</label>
            <input type="number" value={order} onChange={e => setOrder(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
            <p className="text-xs text-stone-500 mt-1">Lower numbers appear first</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button disabled={submitting || !name.trim()}
            onClick={async () => { setSubmitting(true); await onSubmit({ name: name.trim(), displayOrder: Number(order) || 0 }); setSubmitting(false); }}
            className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SubcategoryFormModal({ subcategory, categoryName, onClose, onSubmit }) {
  const [name, setName] = useState(subcategory?.name || '');
  const [order, setOrder] = useState(subcategory?.display_order ?? 0);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-700" /> {subcategory ? 'Edit tag' : `New tag in "${categoryName}"`}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Tag name</label>
            <input type="text" value={name} autoFocus onChange={e => setName(e.target.value)}
              placeholder="e.g. Mystery"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Display order</label>
            <input type="number" value={order} onChange={e => setOrder(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button disabled={submitting || !name.trim()}
            onClick={async () => { setSubmitting(true); await onSubmit({ name: name.trim(), displayOrder: Number(order) || 0 }); setSubmitting(false); }}
            className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// AUTH MODAL
// =====================================================
function AuthModal({ mode, setMode, onClose, showToast }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Please fill in all fields'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      login(data.token, data.user);
      onClose();
      showToast(data.isFirstUser
        ? '🎉 Welcome! You are the first user and became an admin.'
        : (mode === 'login' ? 'Welcome back!' : 'Account created!'));
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            {mode === 'login' ? <><LogIn className="w-5 h-5 text-amber-700" /> Sign in</> : <><UserPlus className="w-5 h-5 text-amber-700" /> Create account</>}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username"
              placeholder="e.g. storylover"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
          <button type="submit" disabled={submitting}
            className="w-full px-5 py-2.5 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <p className="text-center text-sm text-stone-600 pt-2">
            {mode === 'login' ? "Don't have an account? " : 'Already have one? '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-amber-800 font-semibold hover:underline">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

// =====================================================
// STORY EDITOR
// =====================================================
function StoryEditorModal({ mode, story, categories, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState(story?.title || '');
  const [author, setAuthor] = useState(story?.author || '');
  const [subcategoryId, setSubcategoryId] = useState(story?.subcategory?.id || '');
  const [excerpt, setExcerpt] = useState(story?.excerpt || '');
  const [content, setContent] = useState(story?.content || '');
  const [featured, setFeatured] = useState(story?.featured || false);
  const [bannerFile, setBannerFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [bannerError, setBannerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !author.trim() || !content.trim()) {
      alert('Please fill in title, author, and content');
      return;
    }
    setSubmitting(true);
    await onSubmit(isEdit ? {
      title: title.trim(), author: author.trim(),
      subcategoryId: subcategoryId || null,
      excerpt: excerpt.trim(), content: content.trim(),
      featured: !!featured,
    } : {
      title: title.trim(), author: author.trim(),
      subcategoryId: subcategoryId || '',
      excerpt: excerpt.trim(), content: content.trim(),
      featured: featured ? 'true' : 'false',
      bannerFile,
    });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <PenSquare className="w-5 h-5 text-amber-700" /> {isEdit ? 'Edit story' : 'Publish a new story'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Banner image (optional)</label>
              <BannerPicker file={bannerFile} setFile={setBannerFile} previewUrl={previewUrl} setPreviewUrl={setPreviewUrl} error={bannerError} setError={setBannerError} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="An eye-catching title..."
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Author *</label>
              <input type="text" value={author} onChange={e => setAuthor(e.target.value)}
                placeholder="Author name"
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Tag (optional)</label>
              <select value={subcategoryId} onChange={e => setSubcategoryId(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 bg-white">
                <option value="">— Select a tag —</option>
                {categories.map(cat => (
                  <optgroup key={cat.id} label={cat.name}>
                    {cat.subcategories.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Excerpt / Teaser (optional)</label>
            <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={2}
              placeholder="A short teaser shown on story cards..."
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 resize-none" />
            <p className="text-xs text-stone-500 mt-1">{excerpt.length}/500</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Story content *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={16}
              placeholder="Write your story here...&#10;&#10;Press Enter twice to start a new paragraph."
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 resize-y"
              style={{ fontFamily: 'ui-serif, Georgia, serif', fontSize: '15px', lineHeight: 1.7 }} />
            <p className="text-xs text-stone-500 mt-1">
              {content.length.toLocaleString()} characters •
              About {Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 200)} min read
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-amber-700 focus:ring-amber-600" />
            <span className="text-sm text-stone-700 flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-600" /> Mark as featured
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Publish story'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// BANNER COMPONENTS
// =====================================================
function BannerPicker({ file, setFile, previewUrl, setPreviewUrl, error, setError }) {
  const fileInputRef = useRef(null);
  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please select an image'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('Image too large (max 5MB)'); return; }
    setError('');
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };
  const removePreview = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null);
  };

  return (
    <div>
      {previewUrl ? (
        <div className="relative group">
          <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover rounded-lg border border-stone-200" />
          <button onClick={removePreview} className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow-lg"><X className="w-4 h-4" /></button>
          <button onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-2 right-2 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg">Change</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-stone-300 hover:border-amber-700 hover:bg-amber-50 rounded-lg p-8 flex flex-col items-center justify-center gap-2 transition">
          <Upload className="w-8 h-8 text-stone-400" />
          <div className="text-sm text-stone-600 font-medium">Click to upload banner</div>
          <div className="text-xs text-stone-400">JPG, PNG, WebP — max 5MB</div>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])} />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function BannerEditModal({ currentBannerUrl, onClose, onSave, onRemove }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(currentBannerUrl || null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    if (file) await onSave(file);
    else if (!previewUrl) await onRemove();
    else onClose();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full my-8 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-amber-700" /> {currentBannerUrl ? 'Edit banner' : 'Add banner'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <BannerPicker file={file} setFile={setFile} previewUrl={previewUrl} setPreviewUrl={setPreviewUrl} error={error} setError={setError} />
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
