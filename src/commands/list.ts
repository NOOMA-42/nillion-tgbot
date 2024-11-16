import { Context, Markup } from "telegraf";
import { getUserStoreIds } from '../core/database';
import createDebug from 'debug';
import { retrieveSecret, handleImageResponse } from './retrieve';

const debug = createDebug('bot:list_command');
const APP_ID = process.env.NILLION_APP_ID || '';
const API_BASE = 'https://nillion-storage-apis-v0.onrender.com';
const USER_SEED = Number(process.env.USER_SEED || '');

type StoreItem = {
    store_id: string;
    secret_name: string;
    content_type?: 'image' | 'text';
};

const ITEMS_PER_PAGE = 5;

const generateButtons = (data: StoreItem[], page: number, hasNextPage: boolean) => {
  // Generate buttons for each item
  const itemButtons = data.map((item) =>
    Markup.button.callback(item.secret_name, `store_${item.store_id}`)
  );

  // Add navigation buttons
  const navigationButtons = [];
  if (page > 0) {
    navigationButtons.push(Markup.button.callback('⬅️ Previous', `page_${page - 1}`));
  }
  if (hasNextPage) {
    navigationButtons.push(Markup.button.callback('➡️ Next', `page_${page + 1}`));
  }

  return Markup.inlineKeyboard([...itemButtons.map((btn) => [btn]), navigationButtons]);
};

const fetchPageData = async (page: number, pageSize: number): Promise<{ items: StoreItem[], hasNextPage: boolean }> => {
  const url = `${API_BASE}/api/apps/${APP_ID}/store_ids?page=${page + 1}&page_size=${pageSize}`;
  const response = await fetch(url);
  const result = await response.json();

  return {
    items: result.store_ids || [],
    hasNextPage: (result.store_ids || []).length === pageSize, // 如果结果数量等于 pageSize，说明可能还有下一页
  };
};

const list = () => async (ctx: Context) => {
  try {
    if (!USER_SEED) {
      await ctx.reply('Could not identify user');
      return;
    }

    // 1. Fetch API store objects
    const page = 0;
    const { items, hasNextPage } = await fetchPageData(page, ITEMS_PER_PAGE);

    if (!items || items.length === 0) {
      return ctx.reply('No stored items found.');
    }

    // Display store objects with pagination
    const buttons = generateButtons(items, page, hasNextPage);
    await ctx.reply('📋 Store IDs:', buttons);

    // 2. Separately handle local thumbnails
    const userStoreEntries = await getUserStoreIds(Number(USER_SEED));
    const images = userStoreEntries.filter(entry => entry.contentType === 'image');
    console.log('Images:', images);
    if (images.length > 0) {
      await ctx.reply('🖼️ Your stored image thumbnails:');

      // Handle thumbnails
      const mediaGroup = [];
      for (const img of images) {
        if (img.thumbnail) {
          const imageBuffer = Buffer.from(img.thumbnail, 'base64');
          mediaGroup.push({
            type: 'photo' as const,
            media: { source: imageBuffer },
            caption: `ID: ${img.secretName}`
          });
        }
      }

      if (mediaGroup.length > 0) {
        await ctx.replyWithMediaGroup(mediaGroup);
      }

      // List any images without thumbnails
      const imagesWithoutThumbnails = images.filter(img => !img.thumbnail);
      if (imagesWithoutThumbnails.length > 0) {
        let noThumbMessage = '📸 Images without thumbnails:\n';
        imagesWithoutThumbnails.forEach(img => {
          noThumbMessage += `- ${img.storeId}\n`;
        });
        await ctx.reply(noThumbMessage);
      }
    }
  } catch (error) {
    debug('Error listing store IDs:', error);
    await ctx.reply('An error occurred while listing stored items.');
  }
};

function isDataCallbackQuery(query: any): query is { data: string } {
  return query && 'data' in query;
}

const handleCallbackQuery = () => async (ctx: Context) => {
  if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) return;

  const data = ctx.callbackQuery.data;
  if (!USER_SEED) return;

  // Handle page navigation
  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1], 10);

    try {
      const { items, hasNextPage } = await fetchPageData(page, ITEMS_PER_PAGE);

      if (!items || items.length === 0) {
        return ctx.reply('No more items found.');
      }

      const buttons = generateButtons(items, page, hasNextPage);
      await ctx.editMessageReplyMarkup(buttons.reply_markup);
    } catch (error) {
      console.error('Error fetching paginated data:', error);
      await ctx.reply('An error occurred while navigating pages.');
    }
  }

  if (data.startsWith('store_')) {
    const storeId = data.split('_')[1];
    
    try {
      const userStoreEntries = await getUserStoreIds(Number(USER_SEED));
      const selectedEntry = userStoreEntries.find(entry => entry.storeId === storeId);
      
      if (!selectedEntry) {
        await ctx.reply('Store ID not found');
        return;
      }
  
      const secret = await retrieveSecret(storeId, selectedEntry.secretName, USER_SEED.toString());
  
      if (selectedEntry.contentType === 'image') {
        await handleImageResponse(ctx, secret, selectedEntry.secretName);
      } else {
        await ctx.reply(`Retrieved text: ${secret}`);
      }
  
      await ctx.answerCbQuery();
    } catch (error) {
      debug('Error retrieving value:', error);
      await ctx.reply('Error: ' + (error as Error).message);
      await ctx.answerCbQuery();
    }
  }
};

export { list, handleCallbackQuery };
