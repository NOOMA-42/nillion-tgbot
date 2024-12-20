import { Context } from 'telegraf';
import createDebug from 'debug';
import { getUserAppId } from '../core/database';

const debug = createDebug('bot:nillion_retrieve');

const API_BASE = 'https://nillion-storage-apis-v0.onrender.com';

export async function retrieveSecret(storeId: string, secretName: string, userSeed: string) {
  console.log('Retrieving secret:', storeId, secretName, userSeed);
  const response = await fetch(
    `${API_BASE}/api/secret/retrieve/${storeId}?retrieve_as_nillion_user_seed=${userSeed}&secret_name=${secretName}`
  );
  const result = await response.json();
  
  if (!result.secret) {
    throw new Error('No data found for this store ID');
  }
  
  return result.secret;
}

export async function handleImageResponse(ctx: Context, secret: string, secretName: string) {
  try {
    const imageBuffer = Buffer.from(secret, 'base64');
    await ctx.replyWithPhoto(
      { source: imageBuffer },
      { caption: `Retrieved image: ${secretName}` }
    );
  } catch (photoError) {
    debug('Error sending photo:', photoError);
    throw new Error('Could not process the retrieved image');
  }
}

export const retrieveValue = () => async (ctx: Context) => {
  try {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Please send a text message');
      return;
    }

    const userId = ctx.message.from.id;
    if (!userId) {
      await ctx.reply('Could not identify user');
      return;
    }
    const appId = await getUserAppId(Number(userId));
    if (!appId) {
      throw new Error('Please create an account first using /create');
    }

    const messageText = ctx.message?.text?.split(' ');
    if (!messageText || messageText.length < 3) {
      await ctx.reply('Usage: /retrieve <store_id> <secret_name>');
      return;
    }

    const storeId = messageText[1];
    const secretName = messageText[2];

    const secret = await retrieveSecret(storeId, secretName, userId.toString());

    if (secret.startsWith('/9j/') || secret.startsWith('iVBOR')) {
      await handleImageResponse(ctx, secret, secretName);
    } else {
      await ctx.reply(`Retrieved text: ${secret}`);
    }
  } catch (error) {
    debug('Error retrieving value:', error);
    await ctx.reply((error as Error).message);
  }
};