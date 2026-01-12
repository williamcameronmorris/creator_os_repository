import { supabase } from './supabase';

interface DealDeliverable {
  platform: 'instagram' | 'tiktok' | 'youtube';
  count: number;
  type: string;
}

export async function parseDeliverables(deliverablesText: string): Promise<DealDeliverable[]> {
  const deliverables: DealDeliverable[] = [];
  const lines = deliverablesText.toLowerCase().split('\n').map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    let platform: 'instagram' | 'tiktok' | 'youtube' | null = null;
    let count = 1;
    let type = '';

    if (line.includes('tiktok')) {
      platform = 'tiktok';
      type = 'TikTok';
    } else if (line.includes('instagram') || line.includes('reel')) {
      platform = 'instagram';
      type = 'Reel';
    } else if (line.includes('youtube') || line.includes('short')) {
      platform = 'youtube';
      type = 'Short';
    }

    const countMatch = line.match(/(\d+)/);
    if (countMatch) {
      count = parseInt(countMatch[1]);
    }

    if (platform) {
      deliverables.push({ platform, count, type });
    }
  }

  return deliverables;
}

export async function syncDealToSchedule(
  dealId: string,
  brandName: string,
  deliverablesText: string,
  draftDueDate: string | null,
  userId: string
): Promise<{ success: boolean; postsCreated: number; error?: string }> {
  try {
    const deliverables = await parseDeliverables(deliverablesText);

    if (deliverables.length === 0) {
      return {
        success: false,
        postsCreated: 0,
        error: 'No deliverables found to sync',
      };
    }

    const scheduledDate = draftDueDate
      ? new Date(draftDueDate).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const postsToCreate = [];

    for (const deliverable of deliverables) {
      for (let i = 1; i <= deliverable.count; i++) {
        const caption = `[SPONSORED] ${brandName} - ${deliverable.type} #${i}`;

        postsToCreate.push({
          user_id: userId,
          platform: deliverable.platform,
          caption,
          media_urls: [],
          scheduled_date: scheduledDate,
          status: 'draft',
          deal_id: dealId,
          is_sponsored: true,
          hashtags: [],
          mentions: [],
        });
      }
    }

    const { data, error } = await supabase
      .from('content_posts')
      .insert(postsToCreate)
      .select();

    if (error) {
      console.error('Error creating posts:', error);
      return {
        success: false,
        postsCreated: 0,
        error: error.message,
      };
    }

    await supabase
      .from('deals')
      .update({
        synced_to_schedule: true,
        last_schedule_sync: new Date().toISOString()
      })
      .eq('id', dealId);

    return {
      success: true,
      postsCreated: data?.length || 0,
    };
  } catch (error: any) {
    console.error('Error syncing deal to schedule:', error);
    return {
      success: false,
      postsCreated: 0,
      error: error.message || 'Unknown error',
    };
  }
}

export async function checkDealSyncStatus(dealId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deals')
    .select('synced_to_schedule')
    .eq('id', dealId)
    .maybeSingle();

  if (error || !data) return false;
  return data.synced_to_schedule || false;
}
