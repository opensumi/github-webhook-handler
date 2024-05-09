import { IDingInfo } from '@/kv/types';
import { StringBuilder } from '@/utils/string-builder';
import { code } from '@opensumi/dingtalk-bot/lib/types';

import { IMCommandCenter } from './types';

export function registerCommonCommand(it: IMCommandCenter) {
  it.on(
    'putData',
    async ({ bot, ctx }) => {
      const info = {} as IDingInfo;
      if (ctx.parsed.raw['defaultRepo']) {
        info['defaultRepo'] = ctx.parsed.raw['defaultRepo'];
      }
      await bot.kvManager.updateGroupInfo(bot.id, info);
      await bot.replyText('更新信息成功');
    },
    undefined,
  );

  it.on('getGroupInfo', async ({ bot, ctx }) => {
    await bot.reply(
      code(
        'json',
        JSON.stringify({
          conversationId: ctx.message.conversationId,
          senderCorpId: ctx.message.senderCorpId,
        }),
      ),
    );
  });

  it.on('help', async ({ bot }) => {
    await bot.replyText(it.help());
  });

  it.on('ping', async ({ bot }) => {
    await bot.replyText('pong');
  });
}
