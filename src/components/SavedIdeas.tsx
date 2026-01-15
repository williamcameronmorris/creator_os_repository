import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AnalyticsCTABanner } from './AnalyticsCTABanner';
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Saved Content Ideas</h1>
          <p className="text-muted-foreground">Store and organize your content inspiration</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl hover:from-violet-700 hover:to-fuchsia-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus className="w-5 h-5" />
          Save New Idea
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
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
        </select>

        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
            showArchived
              ? 'bg-violet-600 text-white'
              : 'bg-card border border-border hover:bg-accent'
          }`}
        >
          {showArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
          {showArchived ? 'Show Active' : 'Show Archived'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredIdeas.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative flex items-center justify-center w-24 h-24 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-full border-2 border-violet-500/30">
                <Bookmark className="w-12 h-12 text-violet-500" />
              </div>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">
            {showArchived ? 'No Archived Ideas' : searchQuery || filterPlatform !== 'all' ? 'No Ideas Found' : 'Save Content Ideas for Later'}
          </h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            {showArchived
              ? 'You haven\'t archived any content ideas yet.'
              : searchQuery || filterPlatform !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Capture inspiration and plan your content strategy. Save ideas when they strike and come back to them when you\'re ready to create.'}
          </p>
          {!showArchived && !searchQuery && filterPlatform === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl hover:from-violet-700 hover:to-fuchsia-700 transition-all shadow-lg hover:shadow-xl"
            >
              <Lightbulb className="w-5 h-5" />
              Save Your First Idea
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              className="group relative p-6 bg-card border border-border rounded-xl hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-lg">
                    <PlatformIcon platform={idea.platform} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground capitalize">
                      {idea.platform}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {idea.content_type}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite(idea)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    idea.is_favorite
                      ? 'text-yellow-500 bg-yellow-500/10'
                      : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10'
                  }`}
                >
                  <Star className={`w-4 h-4 ${idea.is_favorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-2">
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
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-md"
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
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => toggleArchive(idea)}
                  className="flex items-center justify-center p-2 bg-secondary hover:bg-accent rounded-lg transition-colors"
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
                  className="flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredIdeas.length > 0 && (
        <div className="mt-12">
          <AnalyticsCTABanner />
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">
                {editingIdea ? 'Edit Content Idea' : 'Save New Content Idea'}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
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
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_favorite"
                  checked={formData.is_favorite}
                  onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked })}
                  className="w-4 h-4 text-violet-600 rounded focus:ring-2 focus:ring-violet-500"
                />
                <label htmlFor="is_favorite" className="text-sm text-foreground">
                  Mark as favorite
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-6 py-3 bg-secondary hover:bg-accent text-foreground rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl hover:from-violet-700 hover:to-fuchsia-700 transition-all shadow-lg"
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
