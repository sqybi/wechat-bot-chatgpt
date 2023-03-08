import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { Configuration, OpenAIApi } from "openai";
import qrcode from "qrcode-terminal";
import tencentcloud from "tencentcloud-sdk-nodejs";
import { WechatyBuilder } from "wechaty";

import GeneralChatMessageProcessor from "./processors/GeneralChatMessageProcessor.js";

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
const processors = {};

// Wechaty initialization
const wechaty = WechatyBuilder.build({
    name: db.data.wechat.name,
});
let bot_user_name = null;

// Tencent SMS initialization
const SmsClient = tencentcloud.sms.v20210111.Client;
const smsClient = db.data.tencent_sms ? new SmsClient({
    credential: {
        secretId: db.data.tencent_sms.secret_id,
        secretKey: db.data.tencent_sms.secret_key,
    },
    region: db.data.tencent_sms.region,
}) : null;
const smsParams = {
    SmsSdkAppId: db.data.tencent_sms.sdk_app_id,
    SignName: db.data.tencent_sms.sign_name,
    TemplateId: db.data.tencent_sms.template_id,
    PhoneNumberSet: db.data.tencent_sms.phone_number_set,
}

// Wechaty listeners
wechaty
    .on("scan", (url, status) => {
        console.log();
        qrcode.generate(url, { small: true });
        console.log(`Scan QR Code to login: ${status}\nhttps://wechaty.js.org/qrcode/${encodeURIComponent(url)}`);
        console.log();
    })
    .on("login", (user) => {
        bot_user_name = user.name();
        console.log(`User ${user} logged in`);
    })
    .on("logout", () => {
        bot_user_name = null;
    })
    .on("error", (error) => {
        console.log("Error happened:");
        console.log(error);
        smsClient.SendSms(
            {
                ...smsParams,
                TemplateParamSet: [
                    db.data.wechat.name + "机器人",
                    error.toString().slice(0, 20) + "...",
                ],
            },
            (err, response) => {
                if (err) {
                    console.log("SMS sending error:");
                    console.log(err);
                    return;
                }
                console.log("SMS sent!");
            }
        );
    })
    .on("message", async (message) => {
        if (!message.self() && message.room()
            && (await message.mentionSelf() ||
                (bot_user_name && (message.text() + " ").includes("@" + bot_user_name)))) {
            if (!(message.room().id in processors)) {
                processors[message.room().id] = new GeneralChatMessageProcessor(
                    openai,
                    db.data.wechat.general_chat_message.history_size,
                    db.data.wechat.general_chat_message.default_system_prompt);
                console.log(`New room: ${message.room().id}`);
            }
            if (message.text().includes("!!!RESET!!!")) {
                await processors[message.room().id].reset(message);
            } else if (message.text().includes("!!!SYSTEM!!!")) {
                await processors[message.room().id].system(message, false, bot_user_name);
            } else if (message.text().includes("!!!SYSTEMRESET!!!")) {
                await processors[message.room().id].system(message, true, bot_user_name);
            } else {
                await processors[message.room().id].process(message, bot_user_name);
            }
        }
    });

// Main
wechaty.start();
