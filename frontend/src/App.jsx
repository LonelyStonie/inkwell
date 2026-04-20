import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { BookOpen, Plus, Search, ChevronLeft, ChevronRight, Sun, Moon, Type, X, Library, PenSquare, ArrowLeft, Calendar, User, Loader2, FileText, Trash2, Upload, Image as ImageIcon, LogIn, LogOut, UserPlus, Shield, Users, BarChart3, Crown, UserCog } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const GENRES = ['Fantasy', 'Romance', 'Mystery', 'Sci-Fi', 'Horror', 'Adventure', 'Drama', 'Comedy', 'Historical', 'Other'];

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
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => { localStorage.removeItem('inkwell_token'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  const login = (newToken, newUser) => {
    localStorage.setItem('inkwell_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };
  const logout = () => {
    localStorage.removeItem('inkwell_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

// =====================================================
// API HELPER (with auth headers)
// =====================================================
function useApi() {
  const { token, logout } = useAuth();

  const authedFetch = async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(url, { ...options, headers });
    if (r.status === 401) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${r.status})`);
    }
    return r.json();
  };

  return {
    listStories: () => fetch(`${API_URL}/api/stories`).then(r => r.json()),
    getStory: (id) => fetch(`${API_URL}/api/stories/${id}`).then(r => r.ok ? r.json() : Promise.reject()),
    createStory: (formData) => authedFetch(`${API_URL}/api/stories`, { method: 'POST', body: formData }),
    deleteStory: (id) => authedFetch(`${API_URL}/api/stories/${id}`, { method: 'DELETE' }),
    addChapter: (storyId, data) => authedFetch(`${API_URL}/api/stories/${storyId}/chapters`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }),
    updateBanner: (storyId, file) => {
      const fd = new FormData(); fd.append('banner', file);
      return authedFetch(`${API_URL}/api/stories/${storyId}/banner`, { method: 'PUT', body: fd });
    },
    removeBanner: (storyId) => authedFetch(`${API_URL}/api/stories/${storyId}/banner`, { method: 'DELETE' }),
    // Admin
    getStats: () => authedFetch(`${API_URL}/api/admin/stats`),
    listUsers: () => authedFetch(`${API_URL}/api/admin/users`),
    updateUserRole: (userId, role) => authedFetch(`${API_URL}/api/admin/users/${userId}/role`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    }),
    deleteUser: (userId) => authedFetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE' }),
  };
}

// =====================================================
// MAIN APP (wrapped in AuthProvider)
// =====================================================
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { loading: authLoading, isAdmin } = useAuth();
  const [view, setView] = useState('home');
  const [stories, setStories] = useState([]);
  const [currentStory, setCurrentStory] = useState(null);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [readerTheme, setReaderTheme] = useState('sepia');
  const [fontSize, setFontSize] = useState(19);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [toast, setToast] = useState(null);

  const api = useApi();

  useEffect(() => { if (!authLoading) reloadStories(); }, [authLoading]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const reloadStories = async () => {
    try {
      const data = await api.listStories();
      setStories(data);
    } catch (e) { showToast(e.message, 'error'); }
    setLoading(false);
  };

  const openStory = async (id) => {
    try {
      const data = await api.getStory(id);
      setCurrentStory(data);
      setView('story');
    } catch (e) { showToast('Could not load story', 'error'); }
  };

  const reloadCurrentStory = async () => {
    if (!currentStory) return;
    try { setCurrentStory(await api.getStory(currentStory.id)); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const handleCreateStory = async (data) => {
    try {
      const fd = new FormData();
      fd.append('title', data.title);
      fd.append('author', data.author);
      fd.append('genre', data.genre);
      fd.append('description', data.description);
      if (data.firstChapterTitle) fd.append('firstChapterTitle', data.firstChapterTitle);
      if (data.firstChapterContent) fd.append('firstChapterContent', data.firstChapterContent);
      if (data.bannerFile) fd.append('banner', data.bannerFile);
      await api.createStory(fd);
      await reloadStories();
      setShowCreateModal(false);
      showToast('Story published!');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleAddChapter = async (data) => {
    try {
      await api.addChapter(currentStory.id, data);
      await reloadCurrentStory();
      await reloadStories();
      setShowChapterModal(false);
      showToast('Chapter added!');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleUpdateBanner = async (file) => {
    try {
      if (file === null) { await api.removeBanner(currentStory.id); showToast('Banner removed'); }
      else { await api.updateBanner(currentStory.id, file); showToast('Banner updated!'); }
      await reloadCurrentStory();
      await reloadStories();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDeleteStory = async () => {
    if (!confirm('Delete this story? This cannot be undone.')) return;
    try {
      await api.deleteStory(currentStory.id);
      await reloadStories();
      setView('home');
      showToast('Story deleted');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const filteredStories = stories.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q);
    const matchGenre = selectedGenre === 'All' || s.genre === selectedGenre;
    return matchSearch && matchGenre;
  });

  if (authLoading || loading) {
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center"><Loader2 className="w-8 h-8 text-amber-700 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <Header
        onGoHome={() => { setView('home'); setSearchQuery(''); setSelectedGenre('All'); }}
        onGoAdmin={() => setView('admin')}
        onPublish={() => setShowCreateModal(true)}
        onShowAuth={(mode) => { setAuthMode(mode); setShowAuthModal(true); }}
        showToast={showToast}
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === 'home' && (
          <HomeView stories={filteredStories} totalStories={stories.length}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            selectedGenre={selectedGenre} setSelectedGenre={setSelectedGenre}
            onSelectStory={openStory}
            onCreateNew={() => setShowCreateModal(true)} />
        )}
        {view === 'story' && currentStory && (
          <StoryDetailView story={currentStory}
            onBack={() => setView('home')}
            onReadChapter={(idx) => { setCurrentChapterIdx(idx); setView('reader'); }}
            onAddChapter={() => setShowChapterModal(true)}
            onUpdateBanner={handleUpdateBanner}
            onDelete={handleDeleteStory} />
        )}
        {view === 'reader' && currentStory && currentStory.chapters[currentChapterIdx] && (
          <ReaderView story={currentStory} chapterIdx={currentChapterIdx}
            theme={readerTheme} setTheme={setReaderTheme}
            fontSize={fontSize} setFontSize={setFontSize}
            onBack={() => setView('story')}
            onPrev={() => setCurrentChapterIdx(i => Math.max(0, i - 1))}
            onNext={() => setCurrentChapterIdx(i => Math.min(currentStory.chapters.length - 1, i + 1))} />
        )}
        {view === 'admin' && isAdmin && (
          <AdminDashboard onBack={() => setView('home')} showToast={showToast} />
        )}
      </main>

      {showCreateModal && isAdmin && <CreateStoryModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateStory} />}
      {showChapterModal && currentStory && isAdmin && <AddChapterModal story={currentStory} onClose={() => setShowChapterModal(false)} onSubmit={handleAddChapter} />}
      {showAuthModal && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setShowAuthModal(false)} showToast={showToast} />}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl text-white font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}

      <footer className="border-t border-stone-200 mt-12 py-6 text-center text-sm text-stone-500">
        <p>Inkwell — Share your stories with the world</p>
      </footer>
    </div>
  );
}

// =====================================================
// HEADER with auth buttons
// =====================================================
function Header({ onGoHome, onGoAdmin, onPublish, onShowAuth, showToast }) {
  const { user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-gradient-to-r from-amber-900 via-amber-800 to-orange-900 text-amber-50 shadow-lg sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={onGoHome} className="flex items-center gap-2 hover:opacity-80 transition">
          <BookOpen className="w-7 h-7" />
          <div className="text-left">
            <h1 className="text-xl font-bold tracking-tight">Inkwell</h1>
            <p className="text-xs text-amber-200/80 -mt-0.5">A home for stories</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button onClick={onPublish} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 hover:bg-white transition text-sm font-semibold">
                <PenSquare className="w-4 h-4" /><span className="hidden sm:inline">Publish</span>
              </button>
              <button onClick={onGoAdmin} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-amber-800/50 transition text-sm">
                <Shield className="w-4 h-4" /><span>Admin</span>
              </button>
            </>
          )}

          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-amber-800/50 transition">
                <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-900 flex items-center justify-center font-bold text-sm">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-sm hidden sm:inline">{user.username}</span>
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
                      <button onClick={() => { onGoAdmin(); setMenuOpen(false); }} className="sm:hidden w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm text-stone-700">
                        <Shield className="w-4 h-4" /> Admin Dashboard
                      </button>
                    )}
                    <button onClick={() => { logout(); setMenuOpen(false); showToast('Signed out'); }} className="w-full text-left px-4 py-2 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 text-sm text-stone-700">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button onClick={() => onShowAuth('login')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-amber-800/50 transition text-sm">
                <LogIn className="w-4 h-4" /><span className="hidden sm:inline">Sign in</span>
              </button>
              <button onClick={() => onShowAuth('register')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 hover:bg-white transition text-sm font-semibold">
                <UserPlus className="w-4 h-4" /><span>Sign up</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// =====================================================
// AUTH MODAL (login / register)
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      login(data.token, data.user);
      onClose();
      if (data.isFirstUser) {
        showToast('🎉 Welcome! You are the first user and became an admin.');
      } else {
        showToast(mode === 'login' ? 'Welcome back!' : 'Account created!');
      }
    } catch (err) {
      setError(err.message);
    }
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
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              autoFocus autoComplete="username" placeholder="e.g. storylover"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
            {mode === 'register' && <p className="text-xs text-stone-500 mt-1">3-30 characters, letters, numbers, underscore</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
            {mode === 'register' && <p className="text-xs text-stone-500 mt-1">At least 6 characters</p>}
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
// ADMIN DASHBOARD
// =====================================================
function AdminDashboard({ onBack, showToast }) {
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

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateUserRole(userId, newRole);
      await load();
      showToast(`User role updated to ${newRole}`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDeleteUser = async (u) => {
    if (!confirm(`Delete user "${u.username}" and all their stories? This cannot be undone.`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
      showToast('User deleted');
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 text-amber-700 animate-spin" /></div>;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-stone-600 hover:text-amber-800 mb-5 transition">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back to library</span>
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><Shield className="w-5 h-5 text-amber-800" /></div>
        <div>
          <h1 className="text-2xl font-bold text-stone-800" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>Admin Dashboard</h1>
          <p className="text-sm text-stone-500">Manage users, stories, and platform overview</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Users" value={stats?.totalUsers || 0} color="text-blue-700 bg-blue-50" />
        <StatCard icon={Crown} label="Admins" value={stats?.totalAdmins || 0} color="text-amber-700 bg-amber-50" />
        <StatCard icon={BookOpen} label="Stories" value={stats?.totalStories || 0} color="text-emerald-700 bg-emerald-50" />
        <StatCard icon={FileText} label="Chapters" value={stats?.totalChapters || 0} color="text-purple-700 bg-purple-50" />
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="p-5 border-b border-stone-200 flex items-center gap-2">
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
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Joined</th>
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
                  <td className="px-4 py-3 text-stone-500 text-xs hidden md:table-cell">
                    {new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {u.id !== currentUser.id && (
                        <>
                          {u.role === 'user' ? (
                            <button onClick={() => handleRoleChange(u.id, 'admin')}
                              className="px-2.5 py-1 text-xs bg-amber-50 text-amber-800 rounded hover:bg-amber-100 font-medium flex items-center gap-1">
                              <Crown className="w-3 h-3" /> Promote
                            </button>
                          ) : (
                            <button onClick={() => handleRoleChange(u.id, 'user')}
                              className="px-2.5 py-1 text-xs bg-stone-100 text-stone-700 rounded hover:bg-stone-200 font-medium">
                              Demote
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete user">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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

// =====================================================
// HOME VIEW
// =====================================================
function HomeView({ stories, totalStories, searchQuery, setSearchQuery, selectedGenre, setSelectedGenre, onSelectStory, onCreateNew }) {
  const { isAdmin } = useAuth();
  return (
    <div>
      <div className="mb-8 text-center py-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-stone-800 mb-2" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          Discover endless stories
        </h2>
        <p className="text-stone-600">Curated tales from passionate writers — your next great read is waiting</p>
      </div>

      <div className="mb-5 relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title or author..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-700" />
      </div>

      <div className="mb-8 flex flex-wrap gap-2 justify-center">
        {['All', ...GENRES].map(g => (
          <button key={g} onClick={() => setSelectedGenre(g)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedGenre === g ? 'bg-amber-800 text-white shadow-md' : 'bg-white text-stone-700 hover:bg-amber-50 border border-stone-200'}`}>
            {g}
          </button>
        ))}
      </div>

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {stories.map(story => <StoryCard key={story.id} story={story} onClick={() => onSelectStory(story.id)} />)}
        </div>
      )}
    </div>
  );
}

function StoryCard({ story, onClick }) {
  return (
    <button onClick={onClick} className="group text-left bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-stone-200">
      <div className={`aspect-[2/3] relative overflow-hidden ${story.bannerUrl ? 'bg-stone-200' : `bg-gradient-to-br ${story.coverColor}`}`}>
        {story.bannerUrl ? (
          <>
            <img src={story.bannerUrl} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-lg" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{story.title}</h3>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center">
              <BookOpen className="w-10 h-10 text-white/40 mx-auto mb-2" />
              <h3 className="text-white font-bold text-base leading-tight line-clamp-3" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{story.title}</h3>
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
          {story.chapterCount} {story.chapterCount === 1 ? 'ch' : 'chs'}
        </div>
      </div>
      <div className="p-3">
        <h4 className="font-semibold text-stone-800 text-sm line-clamp-1 group-hover:text-amber-800">{story.title}</h4>
        <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">by {story.author}</p>
        <span className="inline-block mt-2 text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 rounded-full font-medium">{story.genre}</span>
      </div>
    </button>
  );
}

// =====================================================
// STORY DETAIL VIEW — admin-only actions hidden from others
// =====================================================
function StoryDetailView({ story, onBack, onReadChapter, onAddChapter, onUpdateBanner, onDelete }) {
  const { isAdmin } = useAuth();
  const [editingBanner, setEditingBanner] = useState(false);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-stone-600 hover:text-amber-800 mb-5 transition">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back to library</span>
      </button>

      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        {story.bannerUrl && (
          <div className="relative h-56 sm:h-72 overflow-hidden">
            <img src={story.bannerUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
          </div>
        )}

        <div className="md:flex">
          <div className={`md:w-64 flex-shrink-0 aspect-[2/3] md:aspect-auto relative overflow-hidden ${story.bannerUrl ? 'bg-stone-200' : `bg-gradient-to-br ${story.coverColor}`}`}>
            {story.bannerUrl ? (
              <img src={story.bannerUrl} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-center">
                  <BookOpen className="w-16 h-16 text-white/40 mx-auto mb-3" />
                  <h2 className="text-white font-bold text-2xl leading-tight" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{story.title}</h2>
                </div>
              </div>
            )}
            {isAdmin && (
              <button onClick={() => setEditingBanner(true)} className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />{story.bannerUrl ? 'Change banner' : 'Add banner'}
              </button>
            )}
          </div>

          <div className="p-6 flex-1">
            <span className="inline-block text-xs px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-medium mb-3">{story.genre}</span>
            <h1 className="text-3xl font-bold text-stone-900 mb-2" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{story.title}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-stone-600 mb-4">
              <div className="flex items-center gap-1.5"><User className="w-4 h-4" />{story.author}</div>
              <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
              <div className="flex items-center gap-1.5"><FileText className="w-4 h-4" />{story.chapters.length} {story.chapters.length === 1 ? 'chapter' : 'chapters'}</div>
            </div>
            <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">{story.description || 'No description provided.'}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {story.chapters.length > 0 && (
                <button onClick={() => onReadChapter(0)} className="px-5 py-2.5 bg-amber-800 text-white rounded-xl hover:bg-amber-900 font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Start reading
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={onAddChapter} className="px-5 py-2.5 bg-stone-100 text-stone-700 rounded-xl hover:bg-stone-200 font-semibold flex items-center gap-2 border border-stone-200">
                    <Plus className="w-4 h-4" /> Add chapter
                  </button>
                  <button onClick={onDelete} className="px-3 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 flex items-center gap-2 border border-red-200" title="Delete story">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-stone-200 p-6">
          <h3 className="font-bold text-lg text-stone-800 mb-4">Chapters</h3>
          {story.chapters.length === 0 ? (
            <p className="text-stone-500 text-sm py-4 text-center">No chapters yet.</p>
          ) : (
            <div className="space-y-2">
              {story.chapters.map((ch, idx) => (
                <button key={ch.id} onClick={() => onReadChapter(idx)}
                  className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-amber-50 transition group border border-transparent hover:border-amber-200">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 flex items-center justify-center bg-amber-100 text-amber-800 rounded-full text-sm font-bold">{idx + 1}</span>
                    <span className="text-stone-800 font-medium group-hover:text-amber-800">{ch.title}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-amber-700" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingBanner && isAdmin && (
        <BannerEditModal currentBannerUrl={story.bannerUrl}
          onClose={() => setEditingBanner(false)}
          onSave={async (file) => { await onUpdateBanner(file); setEditingBanner(false); }}
          onRemove={async () => { await onUpdateBanner(null); setEditingBanner(false); }} />
      )}
    </div>
  );
}

// =====================================================
// READER VIEW
// =====================================================
function ReaderView({ story, chapterIdx, theme, setTheme, fontSize, setFontSize, onBack, onPrev, onNext }) {
  const chapter = story.chapters[chapterIdx];
  const themes = {
    light: { bg: 'bg-white', text: 'text-stone-900' },
    sepia: { bg: 'bg-amber-50', text: 'text-stone-800' },
    dark: { bg: 'bg-stone-900', text: 'text-stone-100' },
  };
  const t = themes[theme];

  return (
    <div className={`${t.bg} ${t.text} -mx-4 px-4 py-6 rounded-2xl transition-colors`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:opacity-70">
          <ArrowLeft className="w-4 h-4" /><span className="text-sm">Chapters</span>
        </button>
        <div className="flex items-center gap-2">
          <div className={`flex items-center rounded-lg border ${theme === 'dark' ? 'border-stone-700' : 'border-stone-300'} overflow-hidden`}>
            <button onClick={() => setTheme('light')} className={`p-1.5 ${theme === 'light' ? 'bg-amber-700 text-white' : ''}`}><Sun className="w-4 h-4" /></button>
            <button onClick={() => setTheme('sepia')} className={`p-1.5 ${theme === 'sepia' ? 'bg-amber-700 text-white' : ''}`}><BookOpen className="w-4 h-4" /></button>
            <button onClick={() => setTheme('dark')} className={`p-1.5 ${theme === 'dark' ? 'bg-amber-700 text-white' : ''}`}><Moon className="w-4 h-4" /></button>
          </div>
          <div className={`flex items-center gap-1 rounded-lg border ${theme === 'dark' ? 'border-stone-700' : 'border-stone-300'} px-2 py-1`}>
            <button onClick={() => setFontSize(s => Math.max(14, s - 1))} className="px-1 hover:opacity-70">A-</button>
            <Type className="w-3 h-3 opacity-50" />
            <button onClick={() => setFontSize(s => Math.min(28, s + 1))} className="px-1 hover:opacity-70">A+</button>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-sm opacity-60 mb-1">{story.title}</p>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{chapter.title}</h1>
          <p className="text-xs opacity-50 mt-2">Chapter {chapterIdx + 1} of {story.chapters.length}</p>
        </div>

        <div className="leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif', fontSize: `${fontSize}px`, lineHeight: 1.8 }}>
          {chapter.content}
        </div>

        <div className="mt-12 flex items-center justify-between gap-3 pt-6 border-t border-current/10">
          <button onClick={onPrev} disabled={chapterIdx === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-800 text-white hover:bg-amber-900 font-medium disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm opacity-60">{chapterIdx + 1} / {story.chapters.length}</span>
          <button onClick={onNext} disabled={chapterIdx === story.chapters.length - 1} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-800 text-white hover:bg-amber-900 font-medium disabled:opacity-30 disabled:cursor-not-allowed">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </article>
    </div>
  );
}

// =====================================================
// BANNER PICKER
// =====================================================
function BannerPicker({ file, setFile, previewUrl, setPreviewUrl, error, setError }) {
  const fileInputRef = useRef(null);
  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please select an image file'); return; }
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
          <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg">Change</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-stone-300 hover:border-amber-700 hover:bg-amber-50 rounded-lg p-8 flex flex-col items-center justify-center gap-2 transition">
          <Upload className="w-8 h-8 text-stone-400" />
          <div className="text-sm text-stone-600 font-medium">Click to upload banner</div>
          <div className="text-xs text-stone-400">JPG, PNG, WebP — max 5MB</div>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// =====================================================
// CREATE STORY MODAL
// =====================================================
function CreateStoryModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [description, setDescription] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [bannerError, setBannerError] = useState('');
  const [firstChapterTitle, setFirstChapterTitle] = useState('');
  const [firstChapterContent, setFirstChapterContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !author.trim()) { alert('Please fill in the title and author'); return; }
    setSubmitting(true);
    await onSubmit({
      title: title.trim(), author: author.trim(), genre, description: description.trim(), bannerFile,
      firstChapterTitle: firstChapterTitle.trim(), firstChapterContent: firstChapterContent.trim(),
    });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2"><PenSquare className="w-5 h-5 text-amber-700" /> Publish a new story</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Story banner / cover (optional)</label>
            <BannerPicker file={bannerFile} setFile={setBannerFile} previewUrl={previewUrl} setPreviewUrl={setPreviewUrl} error={bannerError} setError={setBannerError} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Last Cartographer" className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Author *</label>
              <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author name" className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Genre</label>
              <select value={genre} onChange={e => setGenre(e.target.value)} className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 bg-white">
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Synopsis</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Hook your readers..." className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 resize-none" />
          </div>
          <div className="border-t border-stone-200 pt-4">
            <h3 className="font-semibold text-stone-800 mb-3">First chapter (optional)</h3>
            <div className="space-y-3">
              <input type="text" value={firstChapterTitle} onChange={e => setFirstChapterTitle(e.target.value)} placeholder="Chapter 1 title" className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
              <textarea value={firstChapterContent} onChange={e => setFirstChapterContent(e.target.value)} rows={8} placeholder="Write your first chapter here..." className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 resize-y" style={{ fontFamily: 'ui-serif, Georgia, serif' }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Publish story
          </button>
        </div>
      </div>
    </div>
  );
}

function AddChapterModal({ story, onClose, onSubmit }) {
  const [title, setTitle] = useState(`Chapter ${story.chapters.length + 1}`);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) { alert('Please write some content'); return; }
    setSubmitting(true);
    await onSubmit({ title: title.trim(), content: content.trim() });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <div>
            <h2 className="text-xl font-bold text-stone-800">Add new chapter</h2>
            <p className="text-sm text-stone-500 mt-0.5">{story.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Chapter title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Content *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={14} placeholder="Begin writing..." className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 resize-y" style={{ fontFamily: 'ui-serif, Georgia, serif', fontSize: '15px', lineHeight: 1.7 }} />
            <p className="text-xs text-stone-500 mt-1">{content.length} characters</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Publish chapter
          </button>
        </div>
      </div>
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
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-amber-700" /> {currentBannerUrl ? 'Edit banner' : 'Add banner'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <BannerPicker file={file} setFile={setFile} previewUrl={previewUrl} setPreviewUrl={setPreviewUrl} error={error} setError={setError} />
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
