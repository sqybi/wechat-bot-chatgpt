import FixedSizeQueue from '../utils/FixedSizeQueue.js';

export default class GeneralChatMessageProcessor {
    constructor(openai, history_size) {
        this.openai = openai;
        this.history_size = history_size;
        this.history = new FixedSizeQueue(history_size);
        this.system_queries = [
            { "role": "system", "content": "你是一个名字叫做Mai的群聊机器人，你的用途是和群友们聊天。" }
        ];
    }

    format_exc(error) {
        return "> " + error.toString().replaceAll("\n", "\n> ");
    }

    async build_bot_reply(name, request, reply) {
        return `\n${reply}`;
    }

    async process(message, bot_user_name) {
        const text = bot_user_name ? message.text().replaceAll(`@${bot_user_name}`, "").trim() : message.text().trim();
        const current_query = { "role": "user", "content": text };
        try {
            const response = await this.openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: this.system_queries.concat(this.history.list(), current_query),
            });
            const response_message = response.data.choices[0].message;
            const response_query = { "role": response_message.role, "content": response_message.content };
            this.history.push(current_query);
            this.history.push(response_query);
            await message.room().say(await this.build_bot_reply(
                message.talker().name(), text, response_message.content.trim()), message.talker());
            return true;
        } catch (error) {
            await message.room().say(await this.build_bot_reply(
                message.talker().name(), text,
                `遇到未知错误，请检查是否文本过长，或重试一次！\n> 错误信息：\n${this.format_exc(error)}`), message.talker());
        }
        return false;
    }

    async reset(message) {
        await this.history.clear();
        await message.room().say(
            `已经重置会话历史。我已经忘记了我们之前的对话。现在可以重新开始向我提问了。`,
            message.talker());
        return true;
    }
}