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
      const { data, error } = await supabase
        .from('brand_prospects')
        .select('*')
        .order('updated_at', { ascending: false });

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
        return { label: 'Dream Brand', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Star };
      case 'ready_to_pitch':
        return { label: 'Ready to Pitch', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Target };
      case 'researching':
        return { label: 'Researching', color: 'bg-sky-100 text-sky-700 border-sky-200', icon: Search };
      case 'not_a_fit':
        return { label: 'Not a Fit', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: ExternalLink };
      default:
        return { label: status, color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Briefcase };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Brand Library</h1>
          <p className="text-slate-600 mt-1">Research and organize brands you want to work with</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setSelectedProspect(null);
            setShowAddModal(true);
          }}
          className="bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Brand
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search brands, industries, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">
            {prospects.filter(p => p.status === 'dream_brand').length}
          </div>
          <div className="text-sm text-slate-600">Dream Brands</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">
            {prospects.filter(p => p.status === 'ready_to_pitch').length}
          </div>
          <div className="text-sm text-slate-600">Ready to Pitch</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">
            {prospects.filter(p => p.status === 'researching').length}
          </div>
          <div className="text-sm text-slate-600">Researching</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">
            {prospects.filter(p => p.next_follow_up_date).length}
          </div>
          <div className="text-sm text-slate-600">Follow-ups Scheduled</div>
        </div>
      </div>

      {/* Prospects Grid */}
      {filteredProspects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No brands found</h3>
          <p className="text-slate-600 mb-4">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Start building your brand library by adding prospects'
            }
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
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
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => openDetailModal(prospect)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-lg mb-1">{prospect.brand_name}</h3>
                    {prospect.industry && (
                      <p className="text-sm text-slate-600">{prospect.industry}</p>
                    )}
                  </div>
                  {prospect.fit_score && (
                    <div className="bg-slate-100 rounded-lg px-3 py-1 text-sm font-semibold text-slate-900">
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
                      <span key={idx} className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                    {prospect.tags.length > 3 && (
                      <span className="text-slate-500 text-xs">+{prospect.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {prospect.notes && (
                  <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                    {prospect.notes}
                  </p>
                )}

                {prospect.next_follow_up_date && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">
                {selectedProspect ? 'Edit Brand' : 'Add New Brand'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Brand Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.brand_name}
                  onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    <option value="researching">Researching</option>
                    <option value="dream_brand">Dream Brand</option>
                    <option value="ready_to_pitch">Ready to Pitch</option>
                    <option value="not_a_fit">Not a Fit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Budget Tier</label>
                  <select
                    value={formData.budget_tier}
                    onChange={(e) => setFormData({ ...formData, budget_tier: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="fashion, sustainable, lifestyle"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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
                  className="flex-1 px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedProspect.brand_name}</h2>
                {selectedProspect.industry && (
                  <p className="text-slate-600 mt-1">{selectedProspect.industry}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedProspect)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => deleteProspect(selectedProspect.id)}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Quick Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => convertToDeal(selectedProspect)}
                  className="flex-1 bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  Convert to Active Deal
                </button>
                <button
                  onClick={() => setShowFitCheck(!showFitCheck)}
                  className="flex-1 bg-sky-100 text-sky-700 px-6 py-3 rounded-lg hover:bg-sky-200 transition-colors flex items-center justify-center gap-2"
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
                  <h3 className="font-semibold text-slate-900">Contact Information</h3>

                  {selectedProspect.website && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Website</div>
                      <a
                        href={selectedProspect.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:text-sky-700 flex items-center gap-1"
                      >
                        {selectedProspect.website}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {selectedProspect.contact_name && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Contact Name</div>
                      <div className="text-slate-900">{selectedProspect.contact_name}</div>
                    </div>
                  )}

                  {selectedProspect.contact_email && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Email</div>
                      <a href={`mailto:${selectedProspect.contact_email}`} className="text-sky-600 hover:text-sky-700">
                        {selectedProspect.contact_email}
                      </a>
                    </div>
                  )}

                  {selectedProspect.contact_phone && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Phone</div>
                      <a href={`tel:${selectedProspect.contact_phone}`} className="text-sky-600 hover:text-sky-700">
                        {selectedProspect.contact_phone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Details</h3>

                  {selectedProspect.budget_tier && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Budget Tier</div>
                      <div className="text-slate-900 capitalize">{selectedProspect.budget_tier}</div>
                    </div>
                  )}

                  {selectedProspect.fit_score && (
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Fit Score</div>
                      <div className="text-slate-900">{selectedProspect.fit_score}%</div>
                    </div>
                  )}

                  {selectedProspect.tags && selectedProspect.tags.length > 0 && (
                    <div>
                      <div className="text-sm text-slate-600 mb-2">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedProspect.tags.map((tag, idx) => (
                          <span key={idx} className="bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full">
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
                  <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
                  <div className="bg-slate-50 rounded-lg p-4 text-slate-700 whitespace-pre-wrap">
                    {selectedProspect.notes}
                  </div>
                </div>
              )}

              {/* Activity Timeline */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-4">Activity Timeline</h3>
                {activities.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    No activities yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{activity.title}</div>
                          {activity.description && (
                            <div className="text-sm text-slate-600 mt-1">{activity.description}</div>
                          )}
                          <div className="text-xs text-slate-500 mt-1">
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
