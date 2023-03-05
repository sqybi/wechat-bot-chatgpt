import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { Configuration, OpenAIApi } from 'openai';
import { WechatyBuilder } from 'wechaty';

import GeneralChatMessageProcessor from './processors/GeneralChatMessageProcessor.js';

// LowDB database
// Usage:
//   db.data.xxx = xxx;
//   await db.write();
const db = new Low(new JSONFile(join(dirname(fileURLToPath(import.meta.url)), "database.json")));
await db.read();

// OpenAI initialization
const openai = new OpenAIApi(new Configuration({
    apiKey: db.data.openai.secret_key,
}));

// Processor initialization
const processor = new GeneralChatMessageProcessor(openai, db.data.wechat.general_chat_message.history_size);

// Wechaty initialization
const wechaty = WechatyBuilder.build();
let bot_user_name = null;

// Wechaty listeners
wechaty
    .on('scan', (qrcode, status) => {
        console.log(`Scan QR Code to login: ${status}\nhttps://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`);
    })
    .on('login', (user) => {
        bot_user_name = user.name();
        console.log(`User ${user} logged in`);
    })
    .on('logout', (user) => {
        bot_user_name = null;
    })
    .on('message', async (message) => {
        if (!message.self() && message.room()
            && (await message.mentionSelf() ||
                (bot_user_name && (message.text() + " ").includes("@" + bot_user_name)))) {
            await processor.process(message);
        }
    });

// Main
wechaty.start();
