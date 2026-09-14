import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBrand } from '../contexts/BrandContext';
import { supabase } from '../lib/supabase';
import { PostComposer } from '../components/PostComposer';

interface EditPost {
  id: string;
  platform: string;
  caption: string;
  media_urls: string[];
  scheduled_date: string | null;
  status: string;
}

export function PostComposerPage() {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [editPost, setEditPost] = useState<EditPost | undefined>();
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    if (!activeBrand) return; // wait for the brand: the post is read within it

    supabase
      .from('content_posts')
      .select('id, platform, caption, media_urls, scheduled_date, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('brand_id', activeBrand.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEditPost(data as EditPost);
        setLoading(false);
      });
  }, [id, user, activeBrand]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PostComposer
      asPage={true}
      editPost={editPost}
      onClose={() => navigate('/schedule')}
      onSuccess={() => navigate('/schedule')}
    />
  );
}
