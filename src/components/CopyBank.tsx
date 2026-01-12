import { useState, useEffect } from 'react';
import { supabase, type CopySnippet, type DefaultSnippetFavorite } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Copy, Check, Plus, Edit, Trash2, Star, Search, X, ChevronDown } from 'lucide-react';
import { useToast, ToastContainer } from './Toast';
import ScopeRecapGenerator from './ScopeRecapGenerator';

type CopyItem = {
  label: string;
  text: string;
  isCustom?: boolean;
  id?: string;
  isFavorite?: boolean;
  snippetKey?: string;
};

type CopySection = {
  title: string;
  items: CopyItem[];
};

const defaultCopySections: CopySection[] = [
  {
    title: 'Budget Ask',
    items: [
      { label: 'Soft', text: 'Before I recommend a package, can you share the budget range you\'re working with for this campaign?' },
      { label: 'Direct', text: 'What budget have you allocated for creator content on this initiative?' },
      { label: 'Firm', text: 'To make sure I\'m proposing the right scope, I need your budget range. Once I have it, I\'ll send 2 to 3 package options.' },
      { label: 'DM', text: 'Quick one: what budget range are you working with for this?' },
    ],
  },
  {
    title: 'Quote Delivery',
    items: [
      { label: 'Default', text: 'Based on expected views from my last 16 long-form videos and last 10 short posts, here are three options: Low, Standard, Stretch. Same deliverables, different rights and production tiers.' },
      { label: 'Short', text: 'Quoting off expected views, here are Low, Standard, Stretch options. If you tell me the budget range, I\'ll recommend the best fit.' },
      { label: 'If questioned', text: 'Totally fair question. This quote is based on expected views from recent performance, plus the rights requested. If you want, I can adjust the package to match a specific budget.' },
    ],
  },
  {
    title: 'Product-to-Paid Reply',
    items: [
      { label: 'Version A', text: 'Thanks for reaching out. I\'m into the product and I can see it resonating with my audience. If you\'re open to a structured partnership, I\'d recommend 1 short plus a 20 to 30 second mention in long-form with organic usage only. Do you have budget to support a paid package like that?' },
      { label: 'Version B', text: 'Appreciate you reaching out. If you\'d like a guaranteed post, I do that through a paid package with deliverables, timeline, and rights spelled out. If you\'re only offering product, I can accept it with no posting guarantee, and if it\'s a great fit we can discuss a paid feature.' },
      { label: 'Version C', text: 'Thanks for thinking of me. If there\'s budget behind this, I can propose a package that includes short-form plus a long-form placement. What budget range are you working with?' },
      { label: 'DM', text: 'Thanks for reaching out. Is there paid budget behind this, or is it product-only?' },
    ],
  },
  {
    title: 'Follow-Ups',
    items: [
      { label: 'Follow-Up 1 (2-3 days)', text: 'Quick follow-up. Did you get a chance to review the package options I sent? If you share your budget range, I\'ll recommend the best fit and lock a timeline.' },
      { label: 'Follow-Up 2 (6-8 days)', text: 'Checking back before I close the loop on my side. Are you moving forward on creator partnerships for this campaign? If timing has shifted, no problem. I can hold a slot once I know the budget range and target dates.' },
      { label: 'Close Loop (10-14 days)', text: 'Last note from me so I don\'t keep pinging you. Should I close this out for now, or would you like me to revise the package based on your budget range?' },
    ],
  },
  {
    title: 'Usage Rights',
    items: [
      { label: 'Clarify', text: 'Happy to include usage. Can you confirm where you want to use the content and for how long? Organic reposting is included, paid usage is priced separately.' },
      { label: 'Direct', text: 'Paid ads usage changes the licensing, so it\'s a separate line item. Share the platforms and duration and I\'ll quote it.' },
      { label: 'Boundary', text: 'I\'m good with paid usage if it\'s time-bound and clearly defined. I can\'t grant unlimited paid usage.' },
    ],
  },
  {
    title: 'Whitelisting',
    items: [
      { label: 'Simple', text: 'If you want to run this through my handle (whitelisting or Spark Ads), that\'s a separate fee from paid usage. It adds risk and value, so I price it independently.' },
      { label: 'Clarify', text: 'Are you planning to whitelist through my account? If yes, what duration are you expecting? I\'ll include the correct term.' },
      { label: 'Boundary', text: 'I\'m open to whitelisting if it\'s time-bound, with approved copy, and usage begins once payment clears.' },
    ],
  },
  {
    title: 'Exclusivity',
    items: [
      { label: 'Clarify', text: 'Exclusivity is doable as long as it\'s time-bound and category-specific. Once you confirm the category and months, I\'ll include the exclusivity fee.' },
      { label: 'Direct', text: 'Exclusivity removes other paid opportunities in that category, so it\'s priced per month. What exact category and duration are you requesting?' },
      { label: 'Boundary', text: 'I can\'t agree to broad exclusivity like "no competitors" without a defined category and compensation.' },
    ],
  },
  {
    title: 'Rush and Revisions',
    items: [
      { label: 'Rush', text: 'My standard timeline is 10 days for short-form and 2 weeks for long-form. If you need it faster, I can do it with a rush fee based on how tight the turnaround is.' },
      { label: 'Revisions Policy', text: 'This package includes 1 round of revisions. A revision round means one consolidated list of changes in one message. Additional rounds are billed.' },
      { label: 'Reshoot Boundary', text: 'If messaging changes after approval and requires a reshoot, that\'s treated as new scope and billed separately.' },
    ],
  },
  {
    title: 'Payment Terms',
    items: [
      { label: 'Default', text: 'My standard terms are 50% to start, 50% on delivery, Net 15. Usage rights begin once payment clears.' },
      { label: 'Net 30', text: 'Net 30 works if we do 50% upfront and 50% Net 30 from delivery. Usage begins once payment clears.' },
      { label: 'Late Payment', text: 'If payment is delayed, publishing can be paused and usage is not granted until payment clears.' },
    ],
  },
  {
    title: 'Polite Decline',
    items: [
      { label: 'Budget Mismatch', text: 'Thanks for the details. Based on the scope and rights requested, I\'m not able to do this within that budget. If budget opens up later, I\'d be happy to revisit.' },
      { label: 'Bad Fit', text: 'Appreciate the opportunity. I don\'t think this is the right fit for my audience right now, so I\'m going to pass. If something changes on your end, feel free to reach back out.' },
      { label: 'Product-Only', text: 'Thanks for offering product. I\'m focusing on paid partnerships right now, so I\'m going to pass. If you have paid budget in the future, I\'d love to talk.' },
    ],
  },
  {
    title: 'Renewal Prompt',
    items: [
      { label: 'Simple', text: 'Thanks again for the partnership. If you\'d like to keep momentum, I can recommend a follow-up package for the next 30 days based on what performed best. Want me to send options?' },
      { label: 'Direct', text: 'If you\'re planning another push this quarter, I\'d love to lock in a second flight. Should I propose a Core or Premium package based on your next objective?' },
    ],
  },
];

export function CopyBank() {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customSnippets, setCustomSnippets] = useState<CopySnippet[]>([]);
  const [defaultFavorites, setDefaultFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CopySnippet | null>(null);
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { toasts, showToast, removeToast } = useToast();

  const [newSnippet, setNewSnippet] = useState({
    category: 'Budget Ask',
    label: '',
    text: '',
  });

  useEffect(() => {
    if (user) {
      loadCustomSnippets();
      loadDefaultFavorites();
    }
  }, [user]);

  useEffect(() => {
    if (searchQuery || showFavoritesOnly) {
      const allSectionTitles = [...new Set([...defaultCopySections.map(s => s.title), ...customSnippets.map(s => s.category)])];
      setExpandedSections(new Set(allSectionTitles));
    }
  }, [searchQuery, showFavoritesOnly, customSnippets]);

  const loadCustomSnippets = async () => {
    const { data, error } = await supabase
      .from('copy_snippets')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCustomSnippets(data);
    }
  };

  const loadDefaultFavorites = async () => {
    const { data, error } = await supabase
      .from('default_snippet_favorites')
      .select('snippet_key')
      .eq('user_id', user?.id);

    if (!error && data) {
      setDefaultFavorites(new Set(data.map((f) => f.snippet_key)));
    }
  };

  const createSnippet = async () => {
    if (!newSnippet.label || !newSnippet.text) return;

    const { error } = await supabase.from('copy_snippets').insert({
      user_id: user?.id,
      category: newSnippet.category,
      label: newSnippet.label,
      text: newSnippet.text,
      is_favorite: false,
    });

    if (!error) {
      showToast('Snippet created successfully!', 'success');
      loadCustomSnippets();
      setNewSnippet({ category: 'Budget Ask', label: '', text: '' });
      setShowAddModal(false);
    } else {
      showToast('Failed to create snippet', 'error');
    }
  };

  const updateSnippet = async () => {
    if (!editingSnippet) return;

    const { error } = await supabase
      .from('copy_snippets')
      .update({
        category: editingSnippet.category,
        label: editingSnippet.label,
        text: editingSnippet.text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingSnippet.id);

    if (!error) {
      showToast('Snippet updated successfully!', 'success');
      loadCustomSnippets();
      setEditingSnippet(null);
    } else {
      showToast('Failed to update snippet', 'error');
    }
  };

  const deleteSnippet = async (id: string) => {
    if (!confirm('Are you sure you want to delete this snippet?')) return;

    const { error } = await supabase.from('copy_snippets').delete().eq('id', id);

    if (!error) {
      showToast('Snippet deleted successfully!', 'success');
      loadCustomSnippets();
    } else {
      showToast('Failed to delete snippet', 'error');
    }
  };

  const toggleFavorite = async (id: string, currentState: boolean) => {
    const { error } = await supabase
      .from('copy_snippets')
      .update({ is_favorite: !currentState })
      .eq('id', id);

    if (!error) {
      loadCustomSnippets();
    }
  };

  const toggleDefaultFavorite = async (snippetKey: string) => {
    const isFavorited = defaultFavorites.has(snippetKey);

    if (isFavorited) {
      const { error } = await supabase
        .from('default_snippet_favorites')
        .delete()
        .eq('user_id', user?.id)
        .eq('snippet_key', snippetKey);

      if (!error) {
        loadDefaultFavorites();
      }
    } else {
      const { error } = await supabase
        .from('default_snippet_favorites')
        .insert({
          user_id: user?.id,
          snippet_key: snippetKey,
        });

      if (!error) {
        loadDefaultFavorites();
      }
    }
  };

  const toggleSection = (sectionTitle: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionTitle)) {
      newExpanded.delete(sectionTitle);
    } else {
      newExpanded.add(sectionTitle);
    }
    setExpandedSections(newExpanded);
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{([^}]+)\}/g);
    return matches ? matches.map((m) => m.slice(1, -1)) : [];
  };

  const replaceVariables = (text: string, vars: Record<string, string>): string => {
    let result = text;
    Object.entries(vars).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    });
    return result;
  };

  const copyToClipboard = (text: string, id: string) => {
    const vars = extractVariables(text);

    if (vars.length > 0) {
      setSelectedText(text);
      setVariables(vars.reduce((acc, v) => ({ ...acc, [v]: '' }), {}));
      setVariableModalOpen(true);
      return;
    }

    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyWithVariables = () => {
    const finalText = replaceVariables(selectedText, variables);
    navigator.clipboard.writeText(finalText);
    showToast('Copied to clipboard with variables!', 'success');
    setVariableModalOpen(false);
    setSelectedText('');
    setVariables({});
    setCopiedId('variable-copy');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allCategories = [...new Set([...defaultCopySections.map(s => s.title), ...customSnippets.map(s => s.category)])];

  const mergedSections = allCategories.map((category) => {
    const defaultSection = defaultCopySections.find((s) => s.title === category);
    const defaultItems = (defaultSection?.items || []).map((item) => {
      const snippetKey = `${category}-${item.label}`;
      return {
        ...item,
        snippetKey,
        isFavorite: defaultFavorites.has(snippetKey),
      };
    });
    const customItems = customSnippets
      .filter((s) => s.category === category)
      .map((s) => ({
        label: s.label,
        text: s.text,
        isCustom: true,
        id: s.id,
        isFavorite: s.is_favorite,
      }));

    return {
      title: category,
      items: [...defaultItems, ...customItems],
    };
  });

  const filteredSections = mergedSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const matchesSearch =
          searchQuery === '' ||
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          section.title.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesFavorite = !showFavoritesOnly || item.isFavorite;

        return matchesSearch && matchesFavorite;
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="max-w-6xl mx-auto animate-fade-in">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Copy Bank</h2>
              <p className="text-muted-foreground">Click any copy block to copy it to your clipboard</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <Plus className="w-5 h-5" />
              Add Custom Copy
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search copy snippets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-5 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                showFavoritesOnly
                  ? 'bg-chart-5/20 border border-chart-5/30 text-chart-5 hover:bg-chart-5/30 focus:ring-chart-5/50'
                  : 'bg-card border border-border text-foreground hover:bg-muted focus:ring-primary/50'
              }`}
            >
              <Star className={`w-5 h-5 ${showFavoritesOnly ? 'fill-chart-5' : ''}`} />
              Favorites
            </button>
          </div>
        </div>

      {filteredSections.length === 0 ? (
        <div className="text-center py-12 p-6 rounded-xl bg-card border border-border">
          <p className="text-muted-foreground">No snippets found matching your search.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSections.map((section) => {
            const isExpanded = expandedSections.has(section.title);
            return (
              <div key={section.title} className="rounded-xl bg-card border border-border overflow-hidden">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between p-6 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-foreground">{section.title}</h3>
                    <span className="text-sm font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {section.items.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-6 h-6 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? 'transform rotate-180' : ''
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 space-y-3 border-t border-border pt-4">
                    {section.items.map((item) => {
                  const itemId = item.id || `${section.title}-${item.label}`;
                  const isCopied = copiedId === itemId;
                  const hasVariables = extractVariables(item.text).length > 0;

                  return (
                    <div
                      key={itemId}
                      className="group relative bg-muted/50 border border-border hover:border-primary/50 rounded-xl p-4 transition-all cursor-pointer hover:shadow-sm"
                      onClick={() => copyToClipboard(item.text, itemId)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="text-sm font-semibold text-primary">{item.label}</div>
                            {item.isCustom && (
                              <span className="text-xs px-2 py-0.5 bg-chart-2/20 text-chart-2 rounded-full font-medium">
                                Custom
                              </span>
                            )}
                            {hasVariables && (
                              <span className="text-xs px-2 py-0.5 bg-chart-4/20 text-chart-4 rounded-full font-medium">
                                Variables
                              </span>
                            )}
                          </div>
                          <div className="text-foreground text-sm leading-relaxed">{item.text}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-2 rounded-xl bg-background text-muted-foreground hover:text-chart-5 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.isCustom) {
                                toggleFavorite(item.id!, item.isFavorite || false);
                              } else {
                                toggleDefaultFavorite(item.snippetKey!);
                              }
                            }}
                          >
                            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-chart-5 text-chart-5' : ''}`} />
                          </button>
                          {item.isCustom && (
                            <>
                              <button
                                className="p-2 rounded-xl bg-background text-muted-foreground hover:text-primary transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const snippet = customSnippets.find((s) => s.id === item.id);
                                  if (snippet) setEditingSnippet(snippet);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                className="p-2 rounded-xl bg-background text-muted-foreground hover:text-destructive transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSnippet(item.id!);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            className={`flex-shrink-0 p-2 rounded-xl transition-colors ${
                              isCopied
                                ? 'bg-chart-2/20 text-chart-2'
                                : 'bg-background text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(item.text, itemId);
                            }}
                          >
                            {isCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <ScopeRecapGenerator />
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="p-6 max-w-2xl w-full rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">Add Custom Copy Snippet</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Category</label>
                <select
                  value={newSnippet.category}
                  onChange={(e) => setNewSnippet({ ...newSnippet, category: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="Custom">Custom (New Category)</option>
                </select>
                {newSnippet.category === 'Custom' && (
                  <input
                    type="text"
                    placeholder="Enter new category name..."
                    onChange={(e) => setNewSnippet({ ...newSnippet, category: e.target.value })}
                    className="mt-2 w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Label</label>
                <input
                  type="text"
                  value={newSnippet.label}
                  onChange={(e) => setNewSnippet({ ...newSnippet, label: e.target.value })}
                  placeholder="e.g., Friendly Follow-Up"
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Copy Text
                  <span className="text-xs text-muted-foreground ml-2 font-normal">
                    Use {'{brand_name}'}, {'{amount}'}, or any {'{custom_variable}'} for dynamic content
                  </span>
                </label>
                <textarea
                  value={newSnippet.text}
                  onChange={(e) => setNewSnippet({ ...newSnippet, text: e.target.value })}
                  placeholder="Enter your copy text here..."
                  rows={6}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={createSnippet}
                  disabled={!newSnippet.label || !newSnippet.text}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-semibold rounded-xl transition-colors"
                >
                  Add Snippet
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingSnippet && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="p-6 max-w-2xl w-full rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">Edit Copy Snippet</h3>
              <button
                onClick={() => setEditingSnippet(null)}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Category</label>
                <select
                  value={editingSnippet.category}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, category: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Label</label>
                <input
                  type="text"
                  value={editingSnippet.label}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, label: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Copy Text</label>
                <textarea
                  value={editingSnippet.text}
                  onChange={(e) => setEditingSnippet({ ...editingSnippet, text: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={updateSnippet}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingSnippet(null)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {variableModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="p-6 max-w-xl w-full rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">Fill in Variables</h3>
              <button
                onClick={() => setVariableModalOpen(false)}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-4 bg-muted/50 rounded-xl border border-border">
              <div className="text-sm text-muted-foreground mb-2 font-medium">Preview:</div>
              <div className="text-foreground">{replaceVariables(selectedText, variables)}</div>
            </div>

            <div className="space-y-4 mb-6">
              {Object.keys(variables).map((varName) => (
                <div key={varName}>
                  <label className="block text-sm font-semibold text-foreground mb-2">{varName}</label>
                  <input
                    type="text"
                    value={variables[varName]}
                    onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                    placeholder={`Enter ${varName}...`}
                    className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={copyWithVariables}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </button>
              <button
                onClick={() => setVariableModalOpen(false)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
