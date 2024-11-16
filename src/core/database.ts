import { createClient } from '@vercel/kv'
import { readFileSync, writeFileSync } from 'fs'
import createDebug from 'debug'

const debug = createDebug('bot:database')
const ENVIRONMENT = process.env.NODE_ENV || ''
const DB_PATH = 'db.json'

type StoreEntry = {
  storeId: string
  secretName: string
  createdAt: string
  thumbnail?: string
  contentType?: 'image' | 'text'
}

type User = {
  userSeed: number
  appIds: string[] // Changed to string array
  storeIds: StoreEntry[]
  createdAt: string // Added creation timestamp
  lastUpdated: string // Added last updated timestamp
}

type Schema = {
  users: User[]
}

// Initialize Vercel KV client
const kv = ENVIRONMENT === 'production' 
  ? createClient({
      url: process.env.KV_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : null

// Simple JSON operations
const readJson = (): Schema => {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf-8'))
  } catch {
    return { users: [] }
  }
}

const writeJson = (data: Schema) => {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

export async function saveUserStoreId(
    userSeed: number, 
    storeId: string, 
    secretName: string,
    thumbnail?: string,
    contentType?: 'image' | 'text'
  ) {
    const newEntry: StoreEntry = {
      storeId,
      secretName,
      createdAt: new Date().toISOString(),
      thumbnail,
      contentType
    }
  
    if (ENVIRONMENT === 'production' && kv) {
      const existingIds = await kv.get<StoreEntry[]>(`user:${userSeed}`) || []
      existingIds.push(newEntry)
      await kv.set(`user:${userSeed}`, existingIds)
    } else {
      const data = readJson()
      const existingUser = data.users.find(u => u.userSeed === userSeed)
      
      if (existingUser) {
        existingUser.storeIds.push(newEntry)
      } else {
        data.users.push({
          userSeed,
          appIds: [], // Initialize with empty array
          storeIds: [newEntry],
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        })
      }
      writeJson(data)
    }
    
    debug(`Saved store ID ${storeId} for user ${userSeed}`)
    return newEntry
  }

export async function getUserStoreIds(userSeed: number) {
  if (ENVIRONMENT === 'production' && kv) {
    return await kv.get<StoreEntry[]>(`user:${userSeed}`) || []
  } else {
    const data = readJson()
    const user = data.users.find(u => u.userSeed === userSeed)
    return user?.storeIds || []
  }
}

export async function removeUserStoreId(userSeed: number, storeId: string) {
  if (ENVIRONMENT === 'production' && kv) {
    const existingIds = await kv.get<StoreEntry[]>(`user:${userSeed}`) || [];
    const updatedIds = existingIds.filter(entry => entry.storeId !== storeId);
    await kv.set(`user:${userSeed}`, updatedIds);
  } else {
    const data = readJson();
    const user = data.users.find(u => u.userSeed === userSeed);
    
    if (user) {
      user.storeIds = user.storeIds.filter(entry => entry.storeId !== storeId);
      user.lastUpdated = new Date().toISOString();
      writeJson(data);
    }
  }
  
  debug(`Removed store ID ${storeId} for user ${userSeed}`);
}

export async function saveUserAppId(userSeed: number, appId: string) {
  if (ENVIRONMENT === 'production' && kv) {
    await kv.set(`user:${userSeed}:app_id`, appId);
  } else {
    const data = readJson();
    const existingUser = data.users.find(u => u.userSeed === userSeed);
    
    if (existingUser) {
      existingUser.appIds.push(appId);
      existingUser.lastUpdated = new Date().toISOString();
    } else {
      data.users.push({
        userSeed,
        appIds: [appId],
        storeIds: [],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }
    writeJson(data);
  }
  debug(`Saved app ID ${appId} for user ${userSeed}`);
}

export async function getUserAppId(userSeed: number): Promise<string | null> {
  if (ENVIRONMENT === 'production' && kv) {
    return await kv.get<string>(`user:${userSeed}:app_id`);
  } else {
    const data = readJson();
    const user = data.users.find(u => u.userSeed === userSeed);
    return user?.appIds[user.appIds.length - 1] || null; // Return the most recent app ID
  }
}
