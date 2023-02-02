import { Conversation } from '@/ai/conversation';
import { OpenAI } from '@/ai/openai';
import { startsWith } from '@/commander';
import { StringBuilder } from '@/utils';

import type { DingBot } from '../bot';
import { code, markdown } from '../message';
import { IDingInfo } from '../secrets';

import { Context, DingCommandCenter } from './types';

export function registerCommonCommand(it: DingCommandCenter) {
  it.on(
    'putData',
    async (bot: DingBot, ctx: Context<Partial<IDingInfo>>) => {
      const info = {} as IDingInfo;
      if (ctx.parsed.raw['defaultRepo']) {
        info['defaultRepo'] = ctx.parsed.raw['defaultRepo'];
      }
      await bot.kvManager.updateGroupInfo(bot.id, info);
      await bot.replyText('更新信息成功');
    },
    undefined,
    startsWith,
  );

  it.on('getGroupInfo', async (bot: DingBot) => {
    await bot.reply(
      code(
        'json',
        JSON.stringify({
          conversationId: bot.msg.conversationId,
          senderCorpId: bot.msg.senderCorpId,
        }),
      ),
    );
  });

  it.on('help', async (bot: DingBot) => {
    const text = new StringBuilder();
    const prefix = it.prefixes.filter(Boolean).join('、');
    if (prefix) {
      text.add('前缀：' + prefix);
    }

    text.add('支持的命令：', true);

    it.registry.handlers.forEach(([key, [_, compareFunc]]) => {
      text.add(`- ${key}: ${compareFunc.name}`);
    });

    it.regexRegistry.handlers.forEach(([key, [_, compareFunc]]) => {
      text.add(`- ${key}: ${compareFunc.name}`);
    });
    if (it.fallbackHandler) {
      text.add(`- *: fallbackHandler`);
    }

    await bot.replyText(text.build());
  });

  it.on('ping', async (bot: DingBot) => {
    await bot.replyText('pong');
  });

  it.on('开启记忆', async (bot: DingBot) => {
    await bot.conversationKVManager.toggleConversation(true);
    await bot.replyText('已开启记忆');
  });
  it.on('关闭记忆', async (bot: DingBot) => {
    await bot.conversationKVManager.toggleConversation(false);
    await bot.replyText('已关闭记忆');
  });
  it.on('清除记忆', async (bot: DingBot) => {
    await bot.conversationKVManager.clearConversation();
    await bot.replyText('已清除记忆');
  });

  it.all(async (bot: DingBot, ctx: Context) => {
    if (bot.env.OPENAI_API_KEY) {
      console.log('openai api key set');

      const openai = new OpenAI(bot);

      const conversationModeEnabled =
        await bot.conversationKVManager.getConversationModeEnabled();
      if (conversationModeEnabled) {
        const conversation = new Conversation(bot, ctx, openai);
        await conversation.reply();
        return;
      }
      const text = await openai.createCompletion(ctx.command);
      if (text) {
        await openai.reply(text);
      }
    }
  });
}
