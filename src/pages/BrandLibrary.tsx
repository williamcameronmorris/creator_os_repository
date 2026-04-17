import { useState, useEffect } from 'react';
import { Plus, Search, Star, Briefcase, Target, Calendar, ExternalLink, MoreVertical, Edit2, Trash2, ArrowRight, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BrandFitCheck from '../components/BrandFitCheck';

interface BrandProspect {
  id: string;
  brand_name: string;
  website?: string;
  industry?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  status: 'dream_brand' | 'ready_to_pitch' | 'researching' | 'not_a_fit';
  notes?: string;
  tags?: string[];
  fit_score?: number;
  fit_analysis?: any;
  budget_tier?: string;
  last_outreach_date?: string;
  next_follow_up_date?: string;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  title: string;
  description?: string;
  created_at: string;
}

export default function BrandLibrary() {
  const { user } = useAuth();
  const [prospects, setProspects] = useState<BrandProspect[]>([]);
  const [filteredProspects, setFilteredProspects] = useState<BrandProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<BrandProspect | null>(null);
  const [showFitCheck, setShowFitCheck] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [formData, setFormData] = useState({
    brand_name: '',
    website: '',
    industry: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    status: 'researching',
    notes: '',
    tags: '',
    budget_tier: ''
  });

  useEffect(() => {
    if (user) {
      loadProspects();
    }
  }, [user]);

  useEffect(() => {
    filterProspects();
  }, [prospects, searchQuery, statusFilter]);

  const loadProspects = async () => {
    try {
      // Bounded fetch: cap at 200 most-recent rows so the page can't OOM a
      // user with thousands of prospects. True pagination (load-more / infinite
      // scroll) is a follow-up; this prevents the worst case today.
      const { data, error } = await supabase
        .from('brand_prospects')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(0, 199);

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('Error loading prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterProspects = () => {
    let filtered = [...prospects];

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    setFilteredProspects(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const prospectData = {
        user_id: user!.id,
        brand_name: formData.brand_name,
        website: formData.website || null,
        industry: formData.industry || null,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        status: formData.status,
        notes: formData.notes || null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
        budget_tier: formData.budget_tier || null
      };

      if (selectedProspect) {
        const { error } = await supabase
          .from('brand_prospects')
          .update(prospectData)
          .eq('id', selectedProspect.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('brand_prospects')
          .insert([prospectData]);

        if (error) throw error;
      }

      setShowAddModal(false);
      setSelectedProspect(null);
      resetForm();
      loadProspects();
    } catch (error) {
      console.error('Error saving prospect:', error);
    }
  };

  const deleteProspect = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prospect?')) return;

    try {
      const { error } = await supabase
        .from('brand_prospects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadProspects();
      setShowDetailModal(false);
    } catch (error) {
      console.error('Error deleting prospect:', error);
    }
  };

  const convertToDeal = async (prospect: BrandProspect) => {
    // This will navigate to deal intake with pre-filled data
    window.location.href = `/pipeline?convert=${prospect.id}`;
  };

  const loadActivities = async (prospectId: string) => {
    try {
      const { data, error } = await supabase
        .from('brand_prospect_activities')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  };

  const addActivity = async (prospectId: string, type: string, title: string, description?: string) => {
    try {
      const { error } = await supabase
        .from('brand_prospect_activities')
        .insert([{
          prospect_id: prospectId,
          user_id: user!.id,
          activity_type: type,
          title,
          description
        }]);

      if (error) throw error;
      loadActivities(prospectId);
    } catch (error) {
      console.error('Error adding activity:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      brand_name: '',
      website: '',
      industry: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      status: 'researching',
      notes: '',
      tags: '',
      budget_tier: ''
    });
  };

  const openEditModal = (prospect: BrandProspect) => {
    setSelectedProspect(prospect);
    setFormData({
      brand_name: prospect.brand_name,
      website: prospect.website || '',
      industry: prospect.industry || '',
      contact_name: prospect.contact_name || '',
      contact_email: prospect.contact_email || '',
      contact_phone: prospect.contact_phone || '',
      status: prospect.status,
      notes: prospect.notes || '',
      tags: prospect.tags?.join(', ') || '',
      budget_tier: prospect.budget_tier || ''
    });
    setShowAddModal(true);
  };

  const openDetailModal = (prospect: BrandProspect) => {
    setSelectedProspect(prospect);
    setShowDetailModal(true);
    setShowFitCheck(false);
    loadActivities(prospect.id);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'dream_brand':
        return { label: 'Dream Brand', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Star };
      case 'ready_to_pitch':
        return { label: 'Ready to Pitch', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: Target };
      case 'researching':
        return { label: 'Researching', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Search };
      case 'not_a_fit':
        return { label: 'Not a Fit', color: 'bg-muted text-muted-foreground border-border', icon: ExternalLink };
      default:
        return { label: status, color: 'bg-muted text-muted-foreground border-border', icon: Briefcase };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Partnerships</h1>
          <p className="text-muted-foreground mt-1">Manage brand collaborations</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setSelectedProspect(null);
            setShowAddModal(true);
          }}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl hover:bg-primary/90 transition-all font-semibold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Brand
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input
              type="text"
              placeholder="Search brands, industries, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
            >
              <option value="all">All Status</option>
              <option value="dream_brand">Dream Brands</option>
              <option value="ready_to_pitch">Ready to Pitch</option>
              <option value="researching">Researching</option>
              <option value="not_a_fit">Not a Fit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-foreground">
            {prospects.filter(p => p.status === 'dream_brand').length}
          </div>
          <div className="text-sm text-muted-foreground">Dream Brands</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-foreground">
            {prospects.filter(p => p.status === 'ready_to_pitch').length}
          </div>
          <div className="text-sm text-muted-foreground">Ready to Pitch</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-foreground">
            {prospects.filter(p => p.status === 'researching').length}
          </div>
          <div className="text-sm text-muted-foreground">Researching</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-foreground">
            {prospects.filter(p => p.next_follow_up_date).length}
          </div>
          <div className="text-sm text-muted-foreground">Follow-ups Scheduled</div>
        </div>
      </div>

      {/* Prospects Grid */}
      {filteredProspects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Briefcase className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No brands found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Start building your partnerships by adding prospects'
            }
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-xl hover:bg-primary/90 transition-all inline-flex items-center gap-2 font-semibold"
            >
              <Plus className="w-5 h-5" />
              Add Your First Brand
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProspects.map((prospect) => {
            const statusConfig = getStatusConfig(prospect.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={prospect.id}
                className="bg-card rounded-xl border border-border p-6 hover:border-primary/50 transition-all cursor-pointer"
                onClick={() => openDetailModal(prospect)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-lg mb-1">{prospect.brand_name}</h3>
                    {prospect.industry && (
                      <p className="text-sm text-muted-foreground">{prospect.industry}</p>
                    )}
                  </div>
                  {prospect.fit_score && (
                    <div className="bg-primary/10 rounded-lg px-3 py-1 text-sm font-semibold text-primary">
                      {prospect.fit_score}%
                    </div>
                  )}
                </div>

                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${statusConfig.color} mb-4`}>
                  <StatusIcon className="w-4 h-4" />
                  {statusConfig.label}
                </div>

                {prospect.tags && prospect.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {prospect.tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="bg-accent text-accent-foreground text-xs px-2 py-1 rounded-lg">
                        {tag}
                      </span>
                    ))}
                    {prospect.tags.length > 3 && (
                      <span className="text-muted-foreground text-xs">+{prospect.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {prospect.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {prospect.notes}
                  </p>
                )}

                {prospect.next_follow_up_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4 pt-4 border-t border-border">
                    <Calendar className="w-4 h-4" />
                    Follow up: {new Date(prospect.next_follow_up_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
            <div className="p-6 border-b border-border">
              <h2 className="text-2xl font-bold text-foreground">
                {selectedProspect ? 'Edit Brand' : 'Add New Brand'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.brand_name}
                  onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Industry</label>
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  >
                    <option value="researching">Researching</option>
                    <option value="dream_brand">Dream Brand</option>
                    <option value="ready_to_pitch">Ready to Pitch</option>
                    <option value="not_a_fit">Not a Fit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Budget Tier</label>
                  <select
                    value={formData.budget_tier}
                    onChange={(e) => setFormData({ ...formData, budget_tier: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                  >
                    <option value="">Unknown</option>
                    <option value="micro">Micro ($0-$500)</option>
                    <option value="small">Small ($500-$2k)</option>
                    <option value="medium">Medium ($2k-$8k)</option>
                    <option value="large">Large ($8k-$25k)</option>
                    <option value="enterprise">Enterprise ($25k+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="fashion, sustainable, lifestyle"
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
                  placeholder="Research notes, brand observations, campaign ideas..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedProspect(null);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-2 border border-border text-foreground rounded-xl hover:bg-accent transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-semibold"
                >
                  {selectedProspect ? 'Update Brand' : 'Add Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedProspect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-border">
            <div className="p-6 border-b border-border flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{selectedProspect.brand_name}</h2>
                {selectedProspect.industry && (
                  <p className="text-muted-foreground mt-1">{selectedProspect.industry}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedProspect)}
                  className="p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => deleteProspect(selectedProspect.id)}
                  className="p-2 text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors text-xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Quick Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => convertToDeal(selectedProspect)}
                  className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 font-semibold"
                >
                  <ArrowRight className="w-5 h-5" />
                  Convert to Active Deal
                </button>
                <button
                  onClick={() => setShowFitCheck(!showFitCheck)}
                  className="flex-1 bg-blue-500/10 text-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 font-semibold"
                >
                  <Target className="w-5 h-5" />
                  {showFitCheck ? 'Hide' : 'Check'} Brand Fit
                </button>
              </div>

              {/* Fit Check */}
              {showFitCheck && (
                <BrandFitCheck
                  brandName={selectedProspect.brand_name}
                  industry={selectedProspect.industry}
                  onComplete={(score, analysis) => {
                    supabase
                      .from('brand_prospects')
                      .update({
                        fit_score: score,
                        fit_analysis: analysis
                      })
                      .eq('id', selectedProspect.id)
                      .then(() => {
                        loadProspects();
                        addActivity(
                          selectedProspect.id,
                          'research',
                          `Ran fit analysis - Score: ${score}%`
                        );
                      });
                  }}
                />
              )}

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Contact Information</h3>

                  {selectedProspect.website && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Website</div>
                      <a
                        href={selectedProspect.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        {selectedProspect.website}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {selectedProspect.contact_name && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Contact Name</div>
                      <div className="text-foreground">{selectedProspect.contact_name}</div>
                    </div>
                  )}

                  {selectedProspect.contact_email && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Email</div>
                      <a href={`mailto:${selectedProspect.contact_email}`} className="text-primary hover:text-primary/80">
                        {selectedProspect.contact_email}
                      </a>
                    </div>
                  )}

                  {selectedProspect.contact_phone && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Phone</div>
                      <a href={`tel:${selectedProspect.contact_phone}`} className="text-primary hover:text-primary/80">
                        {selectedProspect.contact_phone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Details</h3>

                  {selectedProspect.budget_tier && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Budget Tier</div>
                      <div className="text-foreground capitalize">{selectedProspect.budget_tier}</div>
                    </div>
                  )}

                  {selectedProspect.fit_score && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Fit Score</div>
                      <div className="text-foreground">{selectedProspect.fit_score}%</div>
                    </div>
                  )}

                  {selectedProspect.tags && selectedProspect.tags.length > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedProspect.tags.map((tag, idx) => (
                          <span key={idx} className="bg-accent text-accent-foreground text-sm px-3 py-1 rounded-lg">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedProspect.notes && (
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                  <div className="bg-accent/50 rounded-lg p-4 text-foreground whitespace-pre-wrap">
                    {selectedProspect.notes}
                  </div>
                </div>
              )}

              {/* Activity Timeline */}
              <div>
                <h3 className="font-semibold text-foreground mb-4">Activity Timeline</h3>
                {activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No activities yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex gap-3 p-3 bg-accent/50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{activity.title}</div>
                          {activity.description && (
                            <div className="text-sm text-muted-foreground mt-1">{activity.description}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(activity.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
