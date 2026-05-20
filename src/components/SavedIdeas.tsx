import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Bookmark,
  Plus,
  Instagram,
  Youtube,
  Star,
  Trash2,
  Edit,
  Archive,
  ArchiveRestore,
  Tag,
  Lightbulb,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

interface SavedIdea {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  content_type: string;
  tags: string[];
  notes: string | null;
  inspiration_source: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
}

const platformIcons: Record<string, any> = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  ),
};

export function SavedIdeas() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState<SavedIdea | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    platform: 'instagram',
    content_type: 'reel',
    tags: '',
    notes: '',
    inspiration_source: '',
    is_favorite: false,
  });

  useEffect(() => {
    if (user) {
      loadIdeas();
    } else {
      setLoading(false);
    }
  }, [user, showArchived]);

  const loadIdeas = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('saved_content_ideas')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', showArchived)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading ideas:', error);
    } else {
      setIdeas(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const ideaData = {
      user_id: user.id,
      title: formData.title,
      description: formData.description || null,
      platform: formData.platform,
      content_type: formData.content_type,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
      notes: formData.notes || null,
      inspiration_source: formData.inspiration_source || null,
      is_favorite: formData.is_favorite,
      updated_at: new Date().toISOString(),
    };

    if (editingIdea) {
      const { error } = await supabase
        .from('saved_content_ideas')
        .update(ideaData)
        .eq('id', editingIdea.id);

      if (!error) {
        loadIdeas();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('saved_content_ideas')
        .insert([ideaData]);

      if (!error) {
        loadIdeas();
        resetForm();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      platform: 'instagram',
      content_type: 'reel',
      tags: '',
      notes: '',
      inspiration_source: '',
      is_favorite: false,
    });
    setEditingIdea(null);
    setShowAddModal(false);
  };

  const handleEdit = (idea: SavedIdea) => {
    setEditingIdea(idea);
    setFormData({
      title: idea.title,
      description: idea.description || '',
      platform: idea.platform,
      content_type: idea.content_type,
      tags: idea.tags.join(', '),
      notes: idea.notes || '',
      inspiration_source: idea.inspiration_source || '',
      is_favorite: idea.is_favorite,
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this content idea?')) return;

    const { error } = await supabase
      .from('saved_content_ideas')
      .delete()
      .eq('id', id);

    if (!error) {
      loadIdeas();
    }
  };

  const toggleFavorite = async (idea: SavedIdea) => {
    const { error } = await supabase
      .from('saved_content_ideas')
      .update({ is_favorite: !idea.is_favorite })
      .eq('id', idea.id);

    if (!error) {
      loadIdeas();
    }
  };

  const toggleArchive = async (idea: SavedIdea) => {
    const { error } = await supabase
      .from('saved_content_ideas')
      .update({ is_archived: !idea.is_archived })
      .eq('id', idea.id);

    if (!error) {
      loadIdeas();
    }
  };

  const filteredIdeas = ideas.filter(idea => {
    const matchesPlatform = filterPlatform === 'all' || idea.platform === filterPlatform;
    const matchesSearch = !searchQuery ||
      idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      idea.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      idea.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesPlatform && matchesSearch;
  });

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const Icon = platformIcons[platform] || Lightbulb;
    return <Icon />;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="t-display text-foreground mb-2">
            Saved <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>ideas.</em>
          </h1>
          <p className="t-micro text-muted-foreground">Store and organize your content inspiration</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.08em] uppercase border border-foreground bg-foreground text-background px-4 py-2.5 hover:bg-background hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          Save new idea
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search ideas, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
          />
        </div>

        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-4 py-2.5 bg-card border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
        </select>

        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${
            showArchived
              ? 'bg-foreground text-background'
              : 'border border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          {showArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
          {showArchived ? 'Show Active' : 'Show Archived'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
        </div>
      ) : filteredIdeas.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 border border-border flex items-center justify-center">
              <Bookmark className="w-7 h-7 text-foreground" />
            </div>
          </div>
          <h3 className="text-foreground mb-3" style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
            {showArchived ? 'No archived ideas' : searchQuery || filterPlatform !== 'all' ? 'No ideas found' : 'Save content ideas for later'}
          </h3>
          <p className="t-body mb-8 max-w-md mx-auto">
            {showArchived
              ? "You haven't archived any content ideas yet."
              : searchQuery || filterPlatform !== 'all'
              ? 'Try adjusting your search or filters.'
              : "Capture inspiration and plan your content strategy. Save ideas when they strike and come back to them when you're ready to create."}
          </p>
          {!showArchived && !searchQuery && filterPlatform === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.08em] uppercase border border-foreground bg-foreground text-background px-4 py-2.5 hover:bg-background hover:text-foreground transition-colors"
            >
              <Lightbulb className="w-4 h-4" />
              Save your first idea
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              className="group relative p-6 bg-card border border-border transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-10 h-10 border border-border text-foreground">
                    <PlatformIcon platform={idea.platform} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground capitalize">{idea.platform}</div>
                    <div className="text-xs text-muted-foreground capitalize">{idea.content_type}</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite(idea)}
                  className={`p-1.5 transition-colors border ${
                    idea.is_favorite
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-muted-foreground hover:text-accent hover:border-accent'
                  }`}
                >
                  <Star className={`w-4 h-4 ${idea.is_favorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              <h3 className="text-foreground mb-2 line-clamp-2" style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
                {idea.title}
              </h3>

              {idea.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {idea.description}
                </p>
              )}

              {idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {idea.tags.slice(0, 3).map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border text-foreground"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                  {idea.tags.length > 3 && (
                    <span className="inline-flex items-center px-2 py-1 text-xs text-muted-foreground">
                      +{idea.tags.length - 3}
                    </span>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground mb-4">
                Saved {format(new Date(idea.created_at), 'MMM d, yyyy')}
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(idea)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-mono font-bold tracking-[0.04em] border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => toggleArchive(idea)}
                  className="flex items-center justify-center p-2 border border-border hover:bg-accent transition-colors"
                  title={idea.is_archived ? 'Restore' : 'Archive'}
                >
                  {idea.is_archived ? (
                    <ArchiveRestore className="w-4 h-4" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="flex items-center justify-center p-2 border border-border text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
                {editingIdea ? 'Edit content idea' : 'Save new content idea'}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 border border-border hover:bg-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Idea Title
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Behind-the-scenes vlog"
                  className="w-full px-4 py-2.5 bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What's this idea about?"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Platform
                  </label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className="w-full px-4 py-2.5 bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Content Type
                  </label>
                  <select
                    value={formData.content_type}
                    onChange={(e) => setFormData({ ...formData, content_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-foreground"
                  >
                    {formData.platform === 'instagram' && (
                      <>
                        <option value="reel">Reel</option>
                        <option value="post">Post</option>
                        <option value="story">Story</option>
                      </>
                    )}
                    {formData.platform === 'youtube' && (
                      <>
                        <option value="short">Short</option>
                        <option value="video">Video</option>
                      </>
                    )}
                    {formData.platform === 'tiktok' && (
                      <option value="video">Video</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., tutorial, lifestyle, trending"
                  className="w-full px-4 py-2.5 bg-background border border-border focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Inspiration Source
                </label>
                <input
                  type="text"
                  value={formData.inspiration_source}
                  onChange={(e) => setFormData({ ...formData, inspiration_source: e.target.value })}
                  placeholder="e.g., @username, trending topic, personal experience"
                  className="w-full px-4 py-2.5 bg-background border border-border focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional thoughts, reminders, or details..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-background border border-border focus:outline-none focus:border-foreground"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_favorite"
                  checked={formData.is_favorite}
                  onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked })}
                  className="w-4 h-4 accent-foreground"
                />
                <label htmlFor="is_favorite" className="text-sm text-foreground">
                  Mark as favorite
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-6 py-3 bg-secondary hover:bg-accent text-foreground border border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 font-mono text-[10px] font-bold tracking-[0.08em] uppercase border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground transition-colors"
                >
                  {editingIdea ? 'Update Idea' : 'Save Idea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
